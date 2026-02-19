import { describe, it, expect } from 'vitest';
import {
  RecallContextSchema,
  AnalyzeConversationSchema,
  SummarizeSessionSchema,
  GetTimeWindowContextSchema,
} from './types-context.js';

describe('RecallContextSchema', () => {
  it('should require current_task', () => {
    expect(RecallContextSchema.safeParse({}).success).toBe(false);
    expect(RecallContextSchema.safeParse({ current_task: 'working on auth' }).success).toBe(true);
  });

  it('should apply defaults', () => {
    const result = RecallContextSchema.safeParse({ current_task: 'test' });
    expect(result.data?.limit).toBe(5);
    expect(result.data?.min_importance).toBe(6);
  });
});

describe('AnalyzeConversationSchema', () => {
  it('should require non-empty conversation_text', () => {
    expect(AnalyzeConversationSchema.safeParse({ conversation_text: '' }).success).toBe(false);
    expect(AnalyzeConversationSchema.safeParse({ conversation_text: 'text' }).success).toBe(true);
  });

  it('should apply defaults', () => {
    const result = AnalyzeConversationSchema.safeParse({ conversation_text: 'text' });
    expect(result.data?.auto_categorize).toBe(true);
    expect(result.data?.auto_store).toBe(true);
  });
});

describe('SummarizeSessionSchema', () => {
  it('should parse with no required fields', () => {
    expect(SummarizeSessionSchema.safeParse({}).success).toBe(true);
  });

  it('should apply default lookback_minutes', () => {
    const result = SummarizeSessionSchema.safeParse({});
    expect(result.data?.lookback_minutes).toBe(60);
  });
});

describe('GetTimeWindowContextSchema', () => {
  it('should parse with no required fields', () => {
    expect(GetTimeWindowContextSchema.safeParse({}).success).toBe(true);
  });

  it('should apply defaults', () => {
    const result = GetTimeWindowContextSchema.safeParse({});
    expect(result.data?.format).toBe('markdown');
    expect(result.data?.group_by).toBe('chronological');
    expect(result.data?.include_metadata).toBe(true);
  });

  it('should enforce hours range', () => {
    expect(GetTimeWindowContextSchema.safeParse({ hours: 0 }).success).toBe(false);
    expect(GetTimeWindowContextSchema.safeParse({ hours: 100 }).success).toBe(false);
    expect(GetTimeWindowContextSchema.safeParse({ hours: 12 }).success).toBe(true);
  });
});
