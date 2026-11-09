# AI Call Navigator – Database Interaction Rules

## Purpose
This document defines **how the backend must interact with the database**.  
These rules are **authoritative** and must be followed strictly when generating, modifying, or reasoning about backend logic.

The goal is to ensure:
- Consistency
- Auditability
- Predictable behavior
- Clean separation of responsibilities

---

## General Principles

1. **Every automated call is a session**
   - A session starts when the user initiates a call.
   - A session ends only when a final result is written.

2. **No table is optional**
   - If a table exists, it has a clear responsibility.
   - Do not overload tables with unrelated data.

3. **Never overwrite historical data**
   - Logs, events, and steps are append-only.
   - Only analysis tables may be updated.

4. **Backend writes, Frontend reads**
   - The frontend never writes directly to analysis or result tables.
   - Backend orchestrates the lifecycle.

---

## Table-by-Table Rules

---

## 1. call_entities

### Responsibility
Stores the catalog of frequently called entities (banks, health providers, telcos).

### When to Write
- When a call is initiated to a phone number that does not exist.
- When a known entity is called again.

### Allowed Operations
- INSERT if phone_number does not exist
- UPDATE:
  - total_calls += 1
  - last_called_at = now()

### Forbidden
- Deleting entities
- Duplicating phone numbers

---

## 2. call_sessions

### Responsibility
Represents a **single automated call session**.

### When to Write
- INSERT immediately when the user starts a call.

### Required Fields on Insert
- phone_number
- task
- navigation_mode
- priority

### Lifecycle Updates
- status must evolve sequentially:
  - created
  - dialing
  - ivr_detected
  - validating
  - waiting
  - transferred
  - completed | failed

- started_at is set when dialing begins
- ended_at and duration_seconds are set only once

### Forbidden
- Updating task or phone_number after creation
- Reusing sessions

---

## 3. call_identification_data

### Responsibility
Stores data required to pass IVR validation filters.

### When to Write
- Immediately after creating a call_session
- Before IVR navigation begins

### Notes
- Data may be partial
- This table is read-only after insert

### Forbidden
- Updates after creation
- Storing credentials or secrets

---

## 4. call_events

### Responsibility
Full timeline log of everything that happens during the call.

### When to Write
- Every IVR message
- Every AI action
- Any warning or error

### event_type Allowed Values
- ivr_message
- ia_action
- system
- warning
- error

### Rules
- Always append
- Messages must be human-readable
- metadata must be valid JSON

### Forbidden
- Updates
- Deletes

---

## 5. ivr_steps

### Responsibility
Represents each IVR menu or step detected during the call.

### When to Write
- Each time a new IVR prompt is detected

### Required
- step_order must be sequential per session
- ivr_prompt must match what the IVR said
- detected_options must reflect available options

### Forbidden
- Reordering steps
- Editing past steps

---

## 6. call_ai_analysis

### Responsibility
Represents the AI’s understanding of the call.

### When to Write
- Insert when intent or mood is first detected
- Update as the call evolves

### Allowed Updates
- detected_intent
- mood
- friction_level
- estimated_time_to_human
- confidence
- updated_at

### Forbidden
- Multiple rows per session
- Deleting analysis

---

## 7. call_results

### Responsibility
Final, immutable outcome of the call.

### When to Write
- Exactly once
- When the call finishes or fails

### Required Fields
- success
- final_status
- final_message

### Notes
- full_transcript should contain the complete conversation
- transferred_to_human must reflect reality

### Forbidden
- Updates after insert
- Multiple results per session

---

## 8. ivr_maps

### Responsibility
Stores a hierarchical representation of the IVR structure.

### When to Write
- Optional
- Used for visualization and analytics

### Notes
- parent_step_id may be NULL for root nodes

---

## 9. call_tags

### Responsibility
Lightweight tagging for analytics and classification.

### When to Write
- At the end of the call
- Or during post-processing

### Examples
- bank
- health
- ivr_complex
- slow
- blocked

---

## Global Backend Rules

- A session **must exist** before any other table is written
- call_session_id is mandatory everywhere
- Backend is the single source of truth
- Cursor must not invent fields or tables
- If unsure, ask before generating code

---

## Summary Flow (Canonical)

1. Resolve or create call_entity
2. Create call_session
3. Insert call_identification_data
4. Append call_events
5. Append ivr_steps
6. Insert / update call_ai_analysis
7. Insert call_results
8. Append call_tags

---

## Final Note
These rules exist to **prevent drift, ambiguity, and silent bugs**.  
Any backend implementation must follow them exactly.

If a requirement conflicts with this document, **this document wins**.
