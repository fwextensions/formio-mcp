/**
 * Form.io API Client
 * Handles all interactions with the Form.io REST API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  FormioConfig,
  FormioForm,
  FormioSubmission,
  FormioError
} from '../types/formio.js';

export class FormioClient {
  private client: AxiosInstance;

  constructor(config: FormioConfig) {
    this.client = axios.create({
      baseURL: config.projectUrl,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { 'x-token': config.apiKey }),
        ...(config.token && { 'x-jwt-token': config.token })
      }
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => {
        const formioError: FormioError = {
          message: error.message,
          name: error.name,
          details: error.response?.data
        };
        throw formioError;
      }
    );
  }

  /**
   * List all forms in the project
   */
  async listForms(params?: {
    limit?: number;
    skip?: number;
    select?: string;
    sort?: string;
  }): Promise<FormioForm[]> {
    const response = await this.client.get<FormioForm[]>('/form', { params });
    return response.data;
  }

  /**
   * Get a specific form by ID or path
   */
  async getForm(formIdOrPath: string): Promise<FormioForm> {
    const response = await this.client.get<FormioForm>(`/form/${formIdOrPath}`);
    return response.data;
  }

  /**
   * Create a new form
   */
  async createForm(form: Omit<FormioForm, '_id' | 'created' | 'modified'>): Promise<FormioForm> {
    const response = await this.client.post<FormioForm>('/form', form);
    return response.data;
  }

  /**
   * Update an existing form
   */
  async updateForm(formId: string, form: Partial<FormioForm>): Promise<FormioForm> {
    const response = await this.client.put<FormioForm>(`/form/${formId}`, form);
    return response.data;
  }

  /**
   * Delete a form
   */
  async deleteForm(formId: string): Promise<void> {
    await this.client.delete(`/form/${formId}`);
  }

  /**
   * Get submissions for a specific form
   */
  async getSubmissions(
    formIdOrPath: string,
    params?: {
      limit?: number;
      skip?: number;
      select?: string;
      sort?: string;
    }
  ): Promise<FormioSubmission[]> {
    const response = await this.client.get<FormioSubmission[]>(
      `/${formIdOrPath}/submission`,
      { params }
    );
    return response.data;
  }

  /**
   * Create a submission for a form
   */
  async createSubmission(
    formIdOrPath: string,
    submission: Omit<FormioSubmission, '_id' | 'created' | 'modified'>
  ): Promise<FormioSubmission> {
    const response = await this.client.post<FormioSubmission>(
      `/${formIdOrPath}/submission`,
      submission
    );
    return response.data;
  }
}
