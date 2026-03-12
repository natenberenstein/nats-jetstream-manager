import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { Job } from '../database/entities/job.entity';

export interface JobInfo {
  id: string;
  connection_id: string | null;
  job_type: string;
  status: string;
  progress: number;
  current: number | null;
  total: number | null;
  message: string | null;
  error: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  cancel_requested: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job)
    private readonly jobRepo: Repository<Job>,
    private readonly configService: ConfigService,
  ) {}

  async createJob(
    connectionId: string,
    jobType: string,
    payload?: Record<string, unknown>,
  ): Promise<Job> {
    const job = this.jobRepo.create({
      id: uuidv4(),
      connection_id: connectionId,
      job_type: jobType,
      status: 'pending',
      progress: 0,
      cancel_requested: false,
      payload_json: payload ? JSON.stringify(payload) : undefined,
    });

    return await this.jobRepo.save(job);
  }

  async getJob(connectionId: string, jobId: string): Promise<Job> {
    const job = await this.jobRepo.findOne({
      where: { id: jobId, connection_id: connectionId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return job;
  }

  async listJobs(
    connectionId: string,
    limit?: number,
  ): Promise<{ jobs: JobInfo[]; total: number }> {
    const qb = this.jobRepo
      .createQueryBuilder('job')
      .where('job.connection_id = :connectionId', { connectionId })
      .orderBy('job.created_at', 'DESC');

    if (limit) {
      qb.take(limit);
    }

    const [records, total] = await qb.getManyAndCount();

    return {
      jobs: records.map((j) => this.convertJobToResponse(j)),
      total,
    };
  }

  async updateJob(
    jobId: string,
    updates: Partial<Pick<Job, 'status' | 'progress' | 'current' | 'total' | 'message' | 'error' | 'result_json' | 'started_at' | 'completed_at'>>,
  ): Promise<Job> {
    await this.jobRepo.update(jobId, updates);
    return this.jobRepo.findOneByOrFail({ id: jobId });
  }

  async cancelJob(connectionId: string, jobId: string): Promise<JobInfo> {
    const job = await this.getJob(connectionId, jobId);

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return this.convertJobToResponse(job);
    }

    job.cancel_requested = true;

    if (job.status === 'pending') {
      job.status = 'cancelled';
      job.completed_at = new Date();
    }

    await this.jobRepo.save(job);
    return this.convertJobToResponse(job);
  }

  convertJobToResponse(job: Job): JobInfo {
    return {
      id: job.id,
      connection_id: job.connection_id ?? null,
      job_type: job.job_type,
      status: job.status,
      progress: job.progress,
      current: job.current ?? null,
      total: job.total ?? null,
      message: job.message ?? null,
      error: job.error ?? null,
      payload: job.payload_json ? JSON.parse(job.payload_json) : null,
      result: job.result_json ? JSON.parse(job.result_json) : null,
      cancel_requested: job.cancel_requested,
      created_at: new Date(job.created_at).toISOString(),
      started_at: job.started_at ? new Date(job.started_at).toISOString() : null,
      completed_at: job.completed_at ? new Date(job.completed_at).toISOString() : null,
    };
  }
}
