import type { ConsumerConfig, ConsumerDiagnostic, ConsumerInfo, StreamInfo } from '@/lib/types';

export interface StreamConsumer {
  streamName: string;
  consumer: ConsumerInfo;
}

export interface SubjectConsumerMatch {
  streamName: string;
  streamSubject: string;
  consumerName: string;
  consumerFilter: string;
  relationship: 'exact' | 'consumer-covers-stream' | 'stream-covers-consumer' | 'overlap';
  pending: number;
  ackPending: number;
}

export interface StreamSubjectImpact {
  streamName: string;
  subject: string;
  messages: number;
  bytes: number;
  consumers: SubjectConsumerMatch[];
}

export interface UnmatchedConsumerFilter {
  streamName: string;
  consumerName: string;
  filterSubject: string;
  pending: number;
  ackPending: number;
}

export interface OverlappingStreamSubject {
  leftStream: string;
  leftSubject: string;
  rightStream: string;
  rightSubject: string;
  relationship: 'exact' | 'left-covers-right' | 'right-covers-left' | 'overlap';
}

export interface SubjectAnalysis {
  streamSubjects: StreamSubjectImpact[];
  orphanStreamSubjects: StreamSubjectImpact[];
  unmatchedConsumerFilters: UnmatchedConsumerFilter[];
  overlappingStreamSubjects: OverlappingStreamSubject[];
}

type ConsumerFilterSource =
  | Pick<ConsumerConfig, 'filter_subject' | 'filter_subjects'>
  | Pick<ConsumerDiagnostic, 'filter_subject' | 'filter_subjects'>
  | null
  | undefined;

function tokens(pattern: string): string[] {
  return pattern
    .trim()
    .split('.')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function subjectMatches(pattern: string, subject: string): boolean {
  const patternTokens = tokens(pattern);
  const subjectTokens = tokens(subject);

  for (let i = 0; i < patternTokens.length; i += 1) {
    const token = patternTokens[i];
    if (token === '>') return true;
    if (subjectTokens[i] === undefined) return false;
    if (token !== '*' && token !== subjectTokens[i]) return false;
  }

  return patternTokens.length === subjectTokens.length;
}

export function consumerFilterSubjects(source: ConsumerFilterSource): string[] {
  const plural = Array.isArray(source?.filter_subjects)
    ? source.filter_subjects
        .map((subject) => (typeof subject === 'string' ? subject.trim() : ''))
        .filter((subject): subject is string => subject.length > 0)
    : [];

  if (plural.length > 0) {
    return [...new Set(plural)];
  }

  const singular = source?.filter_subject?.trim();
  return singular ? [singular] : [];
}

export function consumerFilterLabel(source: ConsumerFilterSource, fallback = '*'): string {
  const filters = consumerFilterSubjects(source);
  return filters.length > 0 ? filters.join(', ') : fallback;
}

export function singleConsumerFilterSubject(source: ConsumerFilterSource): string | undefined {
  const filters = consumerFilterSubjects(source);
  return filters.length === 1 ? filters[0] : undefined;
}

export function consumerSubjectMatches(source: ConsumerFilterSource, subject: string): boolean {
  const filters = consumerFilterSubjects(source);
  return filters.length === 0 || filters.some((filter) => subjectMatches(filter, subject));
}

export function subjectPatternsOverlap(left: string, right: string): boolean {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const seen = new Set<string>();

  const visit = (i: number, j: number): boolean => {
    const key = `${i}:${j}`;
    if (seen.has(key)) return false;
    seen.add(key);

    const a = leftTokens[i];
    const b = rightTokens[j];

    if (a === '>' || b === '>') return true;
    if (a === undefined || b === undefined) return a === undefined && b === undefined;
    if (a === '*' || b === '*' || a === b) return visit(i + 1, j + 1);
    return false;
  };

  return visit(0, 0);
}

export function consumerFilterOverlapsSubject(
  source: ConsumerFilterSource,
  subject: string,
): boolean {
  const filters = consumerFilterSubjects(source);
  return filters.length === 0 || filters.some((filter) => subjectPatternsOverlap(subject, filter));
}

export function subjectPatternCovers(cover: string, covered: string): boolean {
  const coverTokens = tokens(cover);
  const coveredTokens = tokens(covered);

  for (let i = 0; i < coverTokens.length; i += 1) {
    const coverToken = coverTokens[i];
    const coveredToken = coveredTokens[i];

    if (coverToken === '>') return true;
    if (coveredToken === '>') return coverToken === '>';
    if (coveredToken === undefined) return false;
    if (coverToken === '*') continue;
    if (coverToken !== coveredToken) return false;
  }

  return coverTokens.length === coveredTokens.length;
}

export function subjectRelationship(
  streamSubject: string,
  consumerFilter: string,
): SubjectConsumerMatch['relationship'] {
  if (streamSubject === consumerFilter) return 'exact';
  if (subjectPatternCovers(consumerFilter, streamSubject)) return 'consumer-covers-stream';
  if (subjectPatternCovers(streamSubject, consumerFilter)) return 'stream-covers-consumer';
  return 'overlap';
}

export function streamSubjectRelationship(
  leftSubject: string,
  rightSubject: string,
): OverlappingStreamSubject['relationship'] {
  if (leftSubject === rightSubject) return 'exact';
  if (subjectPatternCovers(leftSubject, rightSubject)) return 'left-covers-right';
  if (subjectPatternCovers(rightSubject, leftSubject)) return 'right-covers-left';
  return 'overlap';
}

export function analyzeSubjects(
  streams: StreamInfo[],
  consumers: StreamConsumer[],
): SubjectAnalysis {
  const consumersByStream = new Map<string, ConsumerInfo[]>();
  for (const item of consumers) {
    const existing = consumersByStream.get(item.streamName) ?? [];
    existing.push(item.consumer);
    consumersByStream.set(item.streamName, existing);
  }

  const streamSubjects: StreamSubjectImpact[] = streams.flatMap((stream) =>
    (stream.config.subjects.length ? stream.config.subjects : ['>']).map((subject) => {
      const streamConsumers = consumersByStream.get(stream.config.name) ?? [];
      const matches = streamConsumers.flatMap((consumer) => {
        const filters = consumerFilterSubjects(consumer.config);
        const effectiveFilters = filters.length > 0 ? filters : [subject];
        return effectiveFilters.flatMap((filter) => {
          if (!subjectPatternsOverlap(subject, filter)) return [];
          return [
            {
              streamName: stream.config.name,
              streamSubject: subject,
              consumerName: consumer.name,
              consumerFilter: filter,
              relationship: subjectRelationship(subject, filter),
              pending: consumer.num_pending,
              ackPending: consumer.num_ack_pending,
            } satisfies SubjectConsumerMatch,
          ];
        });
      });

      return {
        streamName: stream.config.name,
        subject,
        messages: stream.state.messages,
        bytes: stream.state.bytes,
        consumers: matches,
      };
    }),
  );

  const unmatchedConsumerFilters = consumers.flatMap((item) => {
    const stream = streams.find((candidate) => candidate.config.name === item.streamName);
    if (!stream) return [];
    return consumerFilterSubjects(item.consumer.config).flatMap((filter) => {
      const hasStreamSubject = stream.config.subjects.some((subject) =>
        subjectPatternsOverlap(subject, filter),
      );
      if (hasStreamSubject) return [];
      return {
        streamName: item.streamName,
        consumerName: item.consumer.name,
        filterSubject: filter,
        pending: item.consumer.num_pending,
        ackPending: item.consumer.num_ack_pending,
      };
    });
  });

  const flattenedSubjects = streams.flatMap((stream) =>
    stream.config.subjects.map((subject) => ({ streamName: stream.config.name, subject })),
  );
  const overlappingStreamSubjects: OverlappingStreamSubject[] = [];

  for (let i = 0; i < flattenedSubjects.length; i += 1) {
    for (let j = i + 1; j < flattenedSubjects.length; j += 1) {
      const left = flattenedSubjects[i];
      const right = flattenedSubjects[j];
      if (left.streamName === right.streamName) continue;
      if (!subjectPatternsOverlap(left.subject, right.subject)) continue;
      overlappingStreamSubjects.push({
        leftStream: left.streamName,
        leftSubject: left.subject,
        rightStream: right.streamName,
        rightSubject: right.subject,
        relationship: streamSubjectRelationship(left.subject, right.subject),
      });
    }
  }

  return {
    streamSubjects,
    orphanStreamSubjects: streamSubjects.filter((item) => item.consumers.length === 0),
    unmatchedConsumerFilters,
    overlappingStreamSubjects,
  };
}
