import { ConsumerInfo, StreamInfo } from '@/lib/types';

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
      const matches = streamConsumers
        .map((consumer) => {
          const filter = consumer.config.filter_subject || subject;
          if (!subjectPatternsOverlap(subject, filter)) return null;
          return {
            streamName: stream.config.name,
            streamSubject: subject,
            consumerName: consumer.name,
            consumerFilter: filter,
            relationship: subjectRelationship(subject, filter),
            pending: consumer.num_pending,
            ackPending: consumer.num_ack_pending,
          } satisfies SubjectConsumerMatch;
        })
        .filter((match): match is SubjectConsumerMatch => match !== null);

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
    const filter = item.consumer.config.filter_subject;
    if (!filter) return [];
    const hasStreamSubject = stream.config.subjects.some((subject) =>
      subjectPatternsOverlap(subject, filter),
    );
    if (hasStreamSubject) return [];
    return [
      {
        streamName: item.streamName,
        consumerName: item.consumer.name,
        filterSubject: filter,
        pending: item.consumer.num_pending,
        ackPending: item.consumer.num_ack_pending,
      },
    ];
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
