import axios, { AxiosInstance, AxiosResponse } from "axios";
import {
  JiraIssue,
  TempoWorklogResponse,
  TempoWorklogCreatePayload,
  TempoV4WorklogCreatePayload,
  TempoClientConfig,
  IssueCache,
  TempoApiError,
  TempoScheduleResponse,
  GetScheduleParams
} from "./types/index.js";

export class TempoClient {
  private axiosInstance: AxiosInstance;
  private issueCache: IssueCache = {};
  private config: TempoClientConfig;
  private currentUser: string | null = null; // Cache for the authenticated user

  constructor(config: TempoClientConfig) {
    this.config = config;

    // Create axios instance with PAT authentication
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${config.personalAccessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'TempoFiller-MCP/1.0.0'
      }
    });

    // Add request interceptor for debugging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.error(`DEBUG: Making ${config.method?.toUpperCase()} request to ${config.baseURL}${config.url}`);
        if (config.data) {
          console.error(`DEBUG: Request body:`, JSON.stringify(config.data, null, 2));
        }
        return config;
      },
      (error) => {
        console.error(`DEBUG: Request error:`, error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.error(`DEBUG: Response ${response.status} from ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error(`DEBUG: Response error ${error.response?.status} from ${error.config?.url}`);
        console.error(`DEBUG: Error response:`, error.response?.data);

        if (error.response?.status === 401) {
          throw new Error('Authentication failed. Please check your Personal Access Token.');
        }
        if (error.response?.status === 403) {
          throw new Error('Access forbidden. Please check your permissions in JIRA/Tempo.');
        }
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }

        const apiError: TempoApiError = error.response?.data;
        if (apiError?.message) {
          throw new Error(`Tempo API Error: ${apiError.message}`);
        }

        throw error;
      }
    );
  }

  /**
   * Get the current authenticated user.
   * On Atlassian Cloud, uses the TEMPO_ACCOUNT_ID env var since the Jira
   * REST API does not accept Tempo PATs. Falls back to the legacy Jira
   * /rest/api/latest/myself call for Server/Data Center deployments.
   */
  private async getCurrentUser(): Promise<string> {
    if (this.currentUser) {
      return this.currentUser;
    }

    // Atlassian Cloud: use account ID from env var
    const envAccountId = process.env.TEMPO_ACCOUNT_ID;
    if (envAccountId) {
      this.currentUser = envAccountId;
      console.error(`🔐 AUTHENTICATED USER (from env): ${this.currentUser}`);
      return this.currentUser;
    }

    // Server/Data Center fallback: call Jira API
    try {
      const response = await this.axiosInstance.get('/rest/api/latest/myself');
      this.currentUser = response.data.key;
      console.error(`🔐 AUTHENTICATED USER: ${this.currentUser}`);

      if (!this.currentUser) {
        throw new Error('Unable to determine current user from API response');
      }

      return this.currentUser;
    } catch (error) {
      throw new Error(`Failed to get current user: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect whether we are running against Tempo REST API v4 (api.tempo.io)
   * or the legacy Jira Server/DC plugin endpoints.
   */
  private isTempoCloudApi(): boolean {
    return this.config.baseUrl.includes('api.tempo.io');
  }

  /**
   * Get JIRA issue details by issue key.
   * On Cloud (api.tempo.io), Jira REST endpoints are unavailable so we
   * return cached data or a placeholder.
   */
  async getIssueById(issueKey: string): Promise<JiraIssue> {
    // Check cache first
    const cached = this.issueCache[issueKey];
    if (cached && (Date.now() - cached.cached.getTime()) < 300000) {
      return {
        id: cached.id,
        key: issueKey,
        fields: { summary: cached.summary }
      };
    }

    // On Cloud we can't call Jira API with Tempo PAT
    if (this.isTempoCloudApi()) {
      return {
        id: '0',
        key: issueKey,
        fields: { summary: issueKey }
      };
    }

    // Server/DC: call Jira API directly
    try {
      const response: AxiosResponse<JiraIssue> = await this.axiosInstance.get(
        `/rest/api/latest/issue/${issueKey}`
      );

      const issue = response.data;

      // Cache the result
      this.issueCache[issueKey] = {
        id: issue.id,
        summary: issue.fields.summary,
        cached: new Date()
      };

      return issue;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Issue ${issueKey} not found. Please check the issue key.`);
      }
      throw error;
    }
  }

  /**
   * Get worklogs for the authenticated user.
   * Routes to Tempo REST API v4 or legacy endpoints based on the configured
   * base URL.
   */
  async getWorklogs(params: {
    from?: string;
    to?: string;
    issueKey?: string;
  }): Promise<TempoWorklogResponse[]> {
    if (this.isTempoCloudApi()) {
      return this.getWorklogsV4(params);
    }
    return this.getWorklogsLegacy(params);
  }

  /**
   * Worklogs via Tempo REST API v4 (Atlassian Cloud).
   * Uses GET /4/worklogs/user/{accountId} or GET /4/worklogs/issue/{issueKey}.
   */
  private async getWorklogsV4(params: {
    from?: string;
    to?: string;
    issueKey?: string;
  }): Promise<TempoWorklogResponse[]> {
    const currentUser = await this.getCurrentUser();
    console.error(`🔍 WORKLOG SEARCH (v4): Processing request for params:`, JSON.stringify(params));

    try {
      let allResults: any[] = [];

      if (params.issueKey) {
        console.error(`📋 ISSUE-SPECIFIC: Getting worklogs for issue ${params.issueKey}`);
        const queryParams = new URLSearchParams();
        if (params.from) queryParams.append('from', params.from);
        if (params.to) queryParams.append('to', params.to);
        queryParams.append('limit', '1000');

        const response = await this.axiosInstance.get(
          `/4/worklogs/issue/${params.issueKey}?${queryParams.toString()}`
        );
        const results = response.data?.results || [];
        // Filter by current user
        allResults = results.filter((w: any) => w.author?.accountId === currentUser);
      } else {
        console.error(`📅 DATE-BASED: Getting worklogs for user ${currentUser}`);
        const queryParams = new URLSearchParams();
        if (params.from) queryParams.append('from', params.from);
        if (params.to) queryParams.append('to', params.to);
        queryParams.append('limit', '1000');

        const response = await this.axiosInstance.get(
          `/4/worklogs/user/${currentUser}?${queryParams.toString()}`
        );
        allResults = response.data?.results || [];
      }

      console.error(`📊 TEMPO RESPONSE: Found ${allResults.length} worklogs`);

      // Cache issue info from worklogs for later use (e.g. creating worklogs)
      for (const w of allResults) {
        if (w.issue?.key) {
          this.issueCache[w.issue.key] = {
            id: String(w.issue.id),
            summary: w.issue?.summary || w.issue.key,
            cached: new Date()
          };
        }
      }

      // Transform v4 response to the format expected by tool handlers
      return allResults.map((w: any) => ({
        tempoWorklogId: w.tempoWorklogId,
        id: String(w.tempoWorklogId),
        issue: {
          id: w.issue?.id || 0,
          key: w.issue?.key || `ISSUE-${w.issue?.id || 'unknown'}`,
          summary: w.issue?.summary || w.issue?.key || `Issue #${w.issue?.id || 'unknown'}`,
          internalIssue: false,
          issueStatus: '',
          reporterKey: '',
          estimatedRemainingSeconds: 0,
          components: [],
          issueType: '',
          projectId: 0,
          projectKey: '',
          iconUrl: '',
          versions: []
        },
        timeSpentSeconds: w.timeSpentSeconds,
        billableSeconds: w.billableSeconds || 0,
        timeSpent: '',
        started: `${w.startDate}T${w.startTime || '00:00:00'}.000`,
        comment: w.description || '',
        worker: w.author?.accountId || currentUser,
        updater: '',
        originId: 0,
        originTaskId: w.issue?.id || 0,
        dateCreated: '',
        dateUpdated: '',
        attributes: {}
      })) as TempoWorklogResponse[];
    } catch (error) {
      console.error(`❌ ERROR in getWorklogsV4:`, error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const url = error.config?.url;
        const method = error.config?.method?.toUpperCase();
        const responseData = error.response?.data;
        throw new Error(`Failed to retrieve worklogs: ${method} ${url} returned ${status}. ${responseData?.message || JSON.stringify(responseData)}`);
      }
      throw new Error(`Failed to retrieve worklogs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Worklogs via legacy Jira Server/DC endpoints.
   */
  private async getWorklogsLegacy(params: {
    from?: string;
    to?: string;
    issueKey?: string;
  }): Promise<TempoWorklogResponse[]> {
    const currentUser = await this.getCurrentUser();

    console.error(`🔍 WORKLOG SEARCH (legacy): Processing request for params:`, JSON.stringify(params));
    console.error(`👤 USER: Using authenticated user ${currentUser}`);

    try {
      if (params.issueKey) {
        console.error(`📋 ISSUE-SPECIFIC: Getting worklogs for issue ${params.issueKey}`);

        const issue = await this.getIssueById(params.issueKey);
        console.error(`✅ ISSUE RESOLVED: ${issue.key} - ${issue.fields.summary}`);

        const response = await this.axiosInstance.get(
          `/rest/api/latest/issue/${params.issueKey}/worklog`
        );

        const jiraWorklogs = response.data?.worklogs || [];

        const filteredWorklogs = jiraWorklogs.filter((worklog: any) =>
          worklog.author?.name === currentUser ||
          worklog.author?.accountId === currentUser ||
          worklog.author?.emailAddress === currentUser
        );

        return filteredWorklogs.map((worklog: any) => ({
          id: worklog.id,
          timeSpentSeconds: worklog.timeSpentSeconds,
          billableSeconds: worklog.timeSpentSeconds,
          timeSpent: worklog.timeSpent,
          issue: {
            id: issue.id as any,
            key: params.issueKey!,
            summary: issue.fields.summary,
            internalIssue: false,
            issueStatus: '',
            reporterKey: '',
            estimatedRemainingSeconds: 0,
            components: [],
            issueType: '',
            projectId: 0,
            projectKey: '',
            iconUrl: '',
            versions: []
          },
          started: worklog.started,
          worker: worklog.author?.name || currentUser,
          updater: '',
          originId: 0,
          originTaskId: 0,
          dateCreated: '',
          dateUpdated: '',
          attributes: {}
        })) as TempoWorklogResponse[];
      }

      console.error(`📅 DATE-BASED: Attempting Tempo search for date range`);

      const searchParams: any = {
        from: params.from || '2025-07-01',
        to: params.to || '2025-07-31'
      };

      searchParams.worker = [currentUser];

      const response = await this.axiosInstance.post(
        `/rest/tempo-timesheets/4/worklogs/search`,
        searchParams
      );

      const results = Array.isArray(response.data) ? response.data : [];
      return results;

    } catch (error) {
      console.error(`❌ ERROR in getWorklogsLegacy:`, error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const url = error.config?.url;
        const method = error.config?.method?.toUpperCase();
        const responseData = error.response?.data;
        throw new Error(`Failed to retrieve worklogs: ${method} ${url} returned ${status}. ${responseData?.message || JSON.stringify(responseData)}`);
      }
      throw new Error(`Failed to retrieve worklogs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get work schedule for the authenticated user.
   * Routes to Tempo REST API v4 or legacy endpoints based on the configured
   * base URL.
   */
  async getSchedule(params: GetScheduleParams): Promise<TempoScheduleResponse[]> {
    if (this.isTempoCloudApi()) {
      return this.getScheduleV4(params);
    }
    return this.getScheduleLegacy(params);
  }

  /**
   * Schedule via Tempo REST API v4 (Atlassian Cloud).
   * Uses GET /4/user-schedule/{accountId}.
   */
  private async getScheduleV4(params: GetScheduleParams): Promise<TempoScheduleResponse[]> {
    const currentUser = await this.getCurrentUser();
    console.error(`📅 SCHEDULE SEARCH (v4): Processing request for params:`, JSON.stringify(params));

    try {
      const { startDate, endDate } = params;
      const actualEndDate = endDate || startDate;

      const queryParams = new URLSearchParams();
      queryParams.append('from', startDate);
      queryParams.append('to', actualEndDate);

      const response = await this.axiosInstance.get(
        `/4/user-schedule/${currentUser}?${queryParams.toString()}`
      );

      const results = response.data?.results || [];
      console.error(`📊 TEMPO SCHEDULE RESPONSE: Received ${results.length} days`);

      const totalRequiredSeconds = results.reduce(
        (sum: number, day: any) => sum + (day.requiredSeconds || 0), 0
      );

      // Transform v4 format to the shape expected by tool handlers:
      // [{ schedule: { days: [...], requiredSeconds }, user: { ... } }]
      return [{
        schedule: {
          numberOfWorkingDays: results.filter((d: any) => d.type === 'WORKING_DAY').length,
          requiredSeconds: totalRequiredSeconds,
          days: results.map((day: any) => ({
            date: day.date,
            requiredSeconds: day.requiredSeconds || 0,
            type: day.type || 'NON_WORKING_DAY'
          }))
        },
        user: {
          username: currentUser,
          displayName: '',
          key: currentUser
        }
      }];
    } catch (error) {
      console.error(`❌ ERROR in getScheduleV4:`, error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const url = error.config?.url;
        const method = error.config?.method?.toUpperCase();
        const responseData = error.response?.data;
        throw new Error(`Failed to retrieve schedule: ${method} ${url} returned ${status}. ${responseData?.message || JSON.stringify(responseData)}`);
      }
      throw new Error(`Failed to retrieve schedule: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Schedule via legacy Jira Server/DC endpoints.
   * Uses POST /rest/tempo-core/2/user/schedule/search.
   */
  private async getScheduleLegacy(params: GetScheduleParams): Promise<TempoScheduleResponse[]> {
    const currentUser = await this.getCurrentUser();

    console.error(`📅 SCHEDULE SEARCH (legacy): Processing request for params:`, JSON.stringify(params));

    try {
      const { startDate, endDate } = params;
      const actualEndDate = endDate || startDate;

      const searchParams = {
        from: startDate,
        to: actualEndDate,
        userKeys: [currentUser]
      };

      const response = await this.axiosInstance.post(
        `/rest/tempo-core/2/user/schedule/search`,
        searchParams
      );

      const results = Array.isArray(response.data) ? response.data : [];
      return results;

    } catch (error) {
      console.error(`❌ ERROR in getScheduleLegacy:`, error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const url = error.config?.url;
        const method = error.config?.method?.toUpperCase();
        const responseData = error.response?.data;
        throw new Error(`Failed to retrieve schedule: ${method} ${url} returned ${status}. ${responseData?.message || JSON.stringify(responseData)}`);
      }
      throw new Error(`Failed to retrieve schedule: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test basic connectivity
   */
  private async testConnection(): Promise<void> {
    try {
      if (this.isTempoCloudApi()) {
        const currentUser = await this.getCurrentUser();
        await this.axiosInstance.get(`/4/worklogs/user/${currentUser}?limit=1`);
        console.error(`Connection test successful for user: ${currentUser}`);
      } else {
        const response = await this.axiosInstance.get('/rest/api/2/myself');
        console.error(`Connection test successful. Authenticated as: ${response.data.displayName || response.data.name}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const debugInfo = `
        URL: ${error.config?.baseURL}${error.config?.url}
        Status: ${error.response?.status}
        Method: ${error.config?.method}
        Response: ${JSON.stringify(error.response?.data)}
        `;
        throw new Error(`Authentication test failed: ${error.response?.status} ${error.response?.statusText}. Debug info: ${debugInfo}`);
      }
      throw error;
    }
  }

  /**
   * Get worklogs for a specific issue using JIRA API
   */
  private async getWorklogsForIssue(
    issueKey: string,
    from?: string,
    to?: string,
    worker?: string
  ): Promise<TempoWorklogResponse[]> {
    return this.getWorklogs({ from, to, issueKey });
  }

  /**
   * Create a new worklog entry.
   * Routes to v4 or legacy endpoint based on base URL.
   */
  async createWorklog(payload: TempoWorklogCreatePayload | TempoV4WorklogCreatePayload): Promise<TempoWorklogResponse> {
    if (this.isTempoCloudApi()) {
      return this.createWorklogV4(payload as TempoV4WorklogCreatePayload);
    }
    return this.createWorklogLegacy(payload as TempoWorklogCreatePayload);
  }

  private async createWorklogV4(payload: TempoV4WorklogCreatePayload): Promise<TempoWorklogResponse> {
    try {
      const response = await this.axiosInstance.post('/4/worklogs', payload);
      const worklog = response.data;

      return {
        tempoWorklogId: worklog.tempoWorklogId,
        id: String(worklog.tempoWorklogId),
        issue: {
          id: worklog.issue?.id || 0,
          key: worklog.issue?.key || 'unknown',
          summary: worklog.issue?.summary || worklog.issue?.key || 'unknown',
          internalIssue: false,
          issueStatus: '',
          reporterKey: '',
          estimatedRemainingSeconds: 0,
          components: [],
          issueType: '',
          projectId: 0,
          projectKey: '',
          iconUrl: '',
          versions: []
        },
        timeSpentSeconds: worklog.timeSpentSeconds,
        billableSeconds: worklog.billableSeconds || 0,
        timeSpent: '',
        started: `${worklog.startDate}T${worklog.startTime || '00:00:00'}.000`,
        comment: worklog.description || '',
        worker: worklog.author?.accountId || '',
        updater: '',
        originId: 0,
        originTaskId: worklog.issue?.id || 0,
        dateCreated: '',
        dateUpdated: '',
        attributes: {}
      } as TempoWorklogResponse;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const apiError: TempoApiError = error.response.data;
        throw new Error(`Failed to create worklog: ${apiError.message || JSON.stringify(error.response.data) || error.message}`);
      }
      throw new Error(`Failed to create worklog: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createWorklogLegacy(payload: TempoWorklogCreatePayload): Promise<TempoWorklogResponse> {
    try {
      const response: AxiosResponse<TempoWorklogResponse[]> = await this.axiosInstance.post(
        '/rest/tempo-timesheets/4/worklogs/',
        payload
      );

      const worklogs = response.data;
      if (!Array.isArray(worklogs) || worklogs.length === 0) {
        throw new Error('Unexpected response format from Tempo API');
      }

      return worklogs[0];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const apiError: TempoApiError = error.response.data;
        throw new Error(`Failed to create worklog: ${apiError.message || error.message}`);
      }
      throw new Error(`Failed to create worklog: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a worklog entry.
   * Routes to v4 or legacy endpoint based on base URL.
   */
  async deleteWorklog(worklogId: string): Promise<void> {
    const path = this.isTempoCloudApi()
      ? `/4/worklogs/${worklogId}`
      : `/rest/tempo-timesheets/4/worklogs/${worklogId}`;

    try {
      await this.axiosInstance.delete(path);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Worklog ${worklogId} not found.`);
      }
      throw new Error(`Failed to delete worklog: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Helper method to convert hours to seconds
   */
  hoursToSeconds(hours: number): number {
    return Math.round(hours * 3600);
  }

  /**
   * Helper method to convert seconds to hours
   */
  secondsToHours(seconds: number): number {
    return Math.round((seconds / 3600) * 100) / 100;
  }

  /**
   * Create worklog payload from simplified parameters.
   * Returns a v4 or legacy payload depending on the configured base URL.
   */
  async createWorklogPayload(params: {
    issueKey: string;
    hours: number;
    startDate: string;
    endDate?: string;
    billable?: boolean;
    description?: string;
  }): Promise<TempoWorklogCreatePayload | TempoV4WorklogCreatePayload> {
    const currentUser = await this.getCurrentUser();
    const timeInSeconds = this.hoursToSeconds(params.hours);

    if (this.isTempoCloudApi()) {
      // Try to get numerical issue ID from cache
      const cached = this.issueCache[params.issueKey];
      if (!cached?.id || cached.id === '0') {
        console.error(`⚠️ Issue ${params.issueKey} not in cache. Fetch worklogs first to populate the cache, or the create call may fail.`);
      }

      const payload: TempoV4WorklogCreatePayload = {
        authorAccountId: currentUser,
        issueId: cached?.id ? Number(cached.id) : 0,
        timeSpentSeconds: timeInSeconds,
        billableSeconds: params.billable !== false ? timeInSeconds : 0,
        startDate: params.startDate,
        startTime: "09:00:00",
        description: params.description || undefined
      };
      return payload;
    }

    // Legacy Server/DC payload
    const issue = await this.getIssueById(params.issueKey);
    const startDate = params.startDate;
    const endDate = params.endDate || params.startDate;
    const attributes: Record<string, any> = {};

    const payload: TempoWorklogCreatePayload = {
      attributes,
      billableSeconds: params.billable !== false ? timeInSeconds : 0,
      timeSpentSeconds: timeInSeconds,
      worker: currentUser,
      started: `${startDate}T00:00:00.000`,
      originTaskId: issue.id,
      remainingEstimate: null,
      endDate: `${endDate}T00:00:00.000`,
      comment: params.description || undefined
    };

    return payload;
  }

  /**
   * Batch create multiple worklogs
   * Uses Promise.all() for concurrent processing
   */
  async createWorklogsBatch(worklogParams: Array<{
    issueKey: string;
    hours: number;
    startDate: string;
    endDate?: string;
    billable?: boolean;
    description?: string;
  }>): Promise<Array<{
    success: boolean;
    worklog?: TempoWorklogResponse;
    error?: string;
    originalParams: typeof worklogParams[0];
  }>> {
    const payloadPromises = worklogParams.map(async (params) => ({
      params,
      payload: await this.createWorklogPayload(params)
    }));

    const payloadResults = await Promise.all(payloadPromises);

    const createPromises = payloadResults.map(async ({ params, payload }) => {
      try {
        const worklog = await this.createWorklog(payload);
        return {
          success: true,
          worklog,
          originalParams: params
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          originalParams: params
        };
      }
    });

    return Promise.all(createPromises);
  }

  /**
   * Clear the issue cache (useful for testing or when issues are updated)
   */
  clearIssueCache(): void {
    this.issueCache = {};
  }

  /**
   * Get cached issue count (for monitoring/debugging)
   */
  getCachedIssueCount(): number {
    return Object.keys(this.issueCache).length;
  }
}
