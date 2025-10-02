# Agent Learnings

This directory contains timestamped learnings from debugging sessions, production issues, and important discoveries.

## Purpose

## Naming Convention

Files are named: `YYYYMMDDHHMM_{{LEARNING_TOPIC}}.md`

Example: `202510021250_initial.md`

## Index

### 2025-10-02
- **202510021250_initial.md** - Tax-inclusive calculation bug caused by breaking change to Shopify data access pattern
  - Never change data access patterns without verifying both environments
  - Retool extracts `.data` before passing, test runner doesn't
  - Tax-inclusive vs tax-exclusive calculation logic
  - Testing methodology and verification checklist

## How to Use

1. **Before making changes**: Read relevant learnings to avoid known pitfalls
2. **After debugging**: Document new learnings with timestamp
3. **During code review**: Reference learnings to justify patterns and checks
4. **When onboarding**: Read all learnings chronologically

## Quick Reference - Common Gotchas

---

*Maintained by: Development Team*
*Last updated: 2025-10-02 16:00*
