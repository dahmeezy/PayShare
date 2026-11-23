# UI Components Documentation

This document lists each shared UI component, its variants, states, and how to use it with one short example. All components live in `frontend/ui/` and use design tokens from `tokens.css` for colours, sizes, and spacing.

## Design Tokens

All values come from the `frontend/ui/tokens.css` file. No hard-coded colours or sizes exist in components.

**Key colour tokens:**
- `--color-brand-deep-navy` - #142B45 (brand, navigation, headings)
- `--color-brand-teal` - #159A83 (primary actions, success)
- `--color-neutral-white` - #FFFFFF (surfaces)
- `--color-neutral-light` - #F5F5F5 (light backgrounds)
- `--color-neutral-medium` - #E0E0E0 (borders, secondary text)
- `--color-neutral-dark` - #B0B0B0 (dividers, disabled states)
- `--color-status-awaiting` - #6B7280 (Awaiting approval)
- `--color-status-pending` - #8B5CF6 (Pending payment)
- `--color-status-processing` - #3B82F6 (Processing)
- `--color-status-success` - #10B981 (Successful)
- `--color-status-failed` - #EF4444 (Failed)
- `--color-status-cancelled` - #6B7280 (Cancelled)

**Key spacing tokens:** `--space-xxs` (4px) through `--space-3xl` (64px), based on 8px scale

**Key radius tokens:** `--radius-sm` (6px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-full`

**Key breakpoints:** `--breakpoint-sm` (1024px), `--breakpoint-lg` (1440px)

## Components

### Button

Variants: primary, secondary, disabled, loading

**Default primary button:**
```html
<button class="btn btn-primary">Save</button>
```

**Default secondary button:**
```html
<button class="btn btn-secondary">Cancel</button>
```

**States:** hover, focus-visible, active, disabled

**Sizes:** `btn-sm` (small), `btn-lg` (large)

### Text Input, Dropdown, Search Field, Checkbox

**Text input:**
```html
<input type="text" class="input" placeholder="Enter name...">
```

**Search field (with magnifier icon):**
```html
<input type="search" class="search-field" placeholder="Search...">
```

**Dropdown select:**
```html
<select class="select">
  <option>Select role</option>
  <option>Contractor</option>
  <option>Worker</option>
</select>
```

**Checkbox:**
```html
<label class="checkbox">
  <input type="checkbox" class="checkbox-input" checked>
  <span class="checkbox-label">Remember me</span>
</label>
```

**States:** default, hover, focus-visible, disabled, checked

### Avatar

```html
<div class="avatar"><span class="avatar-initials">JS</span></div>
<img src="user.jpg" alt="User name" class="avatar">
```

**Sizes:** set via `--avatar-size` token (default 3rem)

### Status Pill / Badge

**Status pills:**
```html
<span class="status-pill status-pending">
  <span class="status-icon"></span>Pending payment
</span>
<span class="status-pill status-success">
  <span class="status-icon"></span>Successful
</span>
<span class="status-pill status-failed">
  <span class="status-icon"></span>Failed
</span>
```

**Task status labels:**
```html
<span class="task-status-assigned">Assigned</span>
<span class="task-status-accepted">Accepted</span>
<span class="task-status-in-progress">In Progress</span>
<span class="task-status-submitted">Submitted</span>
<span class="task-status-approved">Approved</span>
<span class="task-status-rejected">Rejected</span>
<span class="task-status-cancelled">Cancelled</span>
```

### Navigation

**Sidebar (desktop):**
```html
<div class="sidebar">
  <div class="sidebar-logo">PayShare</div>
  <nav>
    <a href="#" class="sidebar-nav-link sidebar-nav-link--active">
      <svg><use href="#icon-home"></use></svg> Home
    </a>
    <!-- more links -->
  </nav>
</div>
```

**Bottom navigation (mobile):**
```html
<nav class="bottom-nav">
  <div class="bottom-nav-item bottom-nav-item--active">
    <svg><use href="#icon-home"></use></svg><span>Home</span>
  </div>
  <div class="bottom-nav-item"><svg><use href="#icon-file"></use></svg><span>Projects</span></div>
</nav>
```

**App bar:**
```html
<header class="app-bar">
  <div class="app-bar-title">PayShare</div>
  <div class="app-bar-actions">
    <button class="btn btn-sm btn-secondary">Menu</button>
  </div>
</header>
```

### Financial Summary Card

```html
<div class="financial-card">
  <div class="card-header">
    <span class="card-title">Project Budget</span>
  </div>
  <div class="summary-item">
    <span class="label">Total Budget</span>
    <span class="amount">$10,000.00</span>
  </div>
  <div class="summary-item">
    <span class="label">Expenses</span>
    <span class="amount">$2,500.00</span>
  </div>
</div>
```

**Big-number display:**
```html
<div class="big-number">$15,000</div>
<div class="big-number-with-label">
  <span class="label">Total funded</span>
  <div class="big-number">$15,000</div>
</div>
```

**Progress bar:**
```html
<div class="progress-bar">
  <div class="progress-bar-fill progress-bar-fill--success" style="width: 70%"></div>
</div>
<div class="progress-text">70% complete</div>
```

### Table

**Desktop table:**
```html
<table class="table table-striped">
  <thead>
    <tr>
      <th>Task</th>
      <th>Status</th>
      <th>Amount</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Design system</td>
      <td>Assigned</td>
      <td>$1,500</td>
      <td><button class="btn btn-sm btn-secondary">View</button></td>
    </tr>
  </tbody>
</table>
```

**Mobile table (compact):**
```html
<div class="mobile-table">
  <div class="mobile-row">
    <span class="mobile-row-label">Total Budget</span>
    <span class="mobile-row-value">$10,000.00</span>
  </div>
</div>
```

**Mobile table (card mode):**
```html
<div class="mobile-table-card">
  <div class="mobile-card">
    <div class="mobile-card-header">
      <span class="mobile-card-title">Task</span>
      <span class="mobile-card-status">Assigned</span>
    </div>
    <div class="mobile-card-content">Create design system</div>
  </div>
</div>
```

### Tabs

```html
<div class="tabs">
  <div class="tab tab--active">Overview</div>
  <div class="tab">Details</div>
  <div class="tab">Activity</div>
</div>
<div class="tab-panel">
  <div class="tab-content tab-content--active">Overview content</div>
  <div class="tab-content">Details content</div>
  <div class="tab-content">Activity content</div>
</div>
```

### Modal

```html
<!-- Trigger -->
<button class="btn" data-modal-open>Open</button>

<!-- Modal -->
<div class="modal" data-modal>
  <div class="modal-content">
    <div class="modal-header">
      <span class="modal-title">Confirmation</span>
      <button class="modal-close" data-modal-close></button>
    </div>
    <div class="modal-body">
      <p>Are you sure?</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-modal-cancel>Cancel</button>
      <button class="btn btn-primary" data-modal-confirm>Confirm</button>
    </div>
  </div>
</div>
```

### Alert

**Success alert:**
```html
<div class="alert alert--success">
  <span class="alert-icon"></span>
  <span class="alert-message">Changes saved successfully</span>
</div>
```

**Error alert:**
```html
<div class="alert alert--error">
  <span class="alert-icon"></span>
  <span class="alert-message">An error occurred</span>
</div>
```

**Info alert:**
```html
<div class="alert alert--info">
  <span class="alert-icon"></span>
  <span class="alert-message">Changes not saved</span>
</div>
```

### Notification Item

```html
<div class="notification-item">
  <span class="notification-dot notification-dot--unread"></span>
  <div class="notification-content">
    <span class="notification-title">Payment received</span>
    <span class="notification-message">$500.00 received for task completion</span>
  </div>
  <span class="notification-time">2m</span>
</div>
```

**Read state:** add `.notification-item--read` class and `.notification-dot--read`

### File Upload Area

**Idle state:**
```html
<div class="upload-area">
  <div class="upload-area__icon"></div>
  <div class="upload-area__title">Drag & drop files</div>
  <div class="upload-area__hint">or browse (Max 10MB)</div>
  <input type="file" class="upload-area__input">
</div>
```

**States:** idle, `--over`, `--uploading` (with spinner), `--done`, `--failed`

### Voice-Note Player

**Play/record controls:**
```html
<div class="voice-player">
  <span class="voice-player__duration">1:30</span>
  <button class="voice-player__btn voice-player__btn--idle" aria-label="Play"></button>
  <button class="voice-player__btn voice-player__btn--idle" aria-label="Record"></button>
</div>
```

**Record control:**
```html
<div class="record-control" aria-label="Record voice note"></div>
```

**States:** idle, recording, paused

### Task Card

```html
<div class="task-card">
  <div class="task-card-header">
    <div class="task-card-title">Design system</div>
    <span class="task-card-status task-card-status--assigned">Assigned</span>
  </div>
  <div class="task-card-body">
    <p class="task-card-description">Create the design system for PayShare</p>
  </div>
  <div class="task-card-footer">
    <span class="task-card-assigned-to">Assigned to: Amara</span>
    <div class="task-card-actions">
      <button class="btn btn-sm btn-secondary">View</button>
    </div>
  </div>
</div>
```

### Worker Profile Card

```html
<div class="worker-profile-card">
  <div class="worker-avatar"><span class="worker-initials">JS</span></div>
  <div class="worker-name">John Smith</div>
  <div class="worker-role">Worker</div>
  <div class="worker-allocation">$2,500 <span class="currency">USDC</span></div>
  <div class="worker-status-pill status-success">Active</div>
  <div class="worker-info">
    <div class="info-row">
      <span class="info-label">Total earned</span>
      <span class="info-value">$15,000</span>
    </div>
    <div class="info-row">
      <span class="info-label">Tasks completed</span>
      <span class="info-value">12</span>
    </div>
  </div>
</div>
```

### Transaction Row

```html
<div class="transaction-row">
  <span class="transaction-icon" style="background: var(--color-brand-teal);"></span>
  <div class="transaction-details">
    <span class="transaction-title">Payment to worker</span>
    <span class="transaction-meta">2024-01-15</span>
  </div>
  <span class="transaction-amount transaction-amount--positive">+$500.00</span>
  <span class="status-badge status-success">Successful</span>
</div>
```

### Empty State

```html
<div class="empty-state">
  <div class="empty-state-icon"></div>
  <div class="empty-state-title">No tasks found</div>
  <div class="empty-state-description">Tasks appear here when you create them</div>
</div>
```

### Loading State

```html
<div class="loading-state">
  <div class="loading-spinner"></div>
  <span class="loading-text">Loading...</span>
</div>
```

**Skeleton loading:** use `.skeleton` class with `.skeleton-text` or `.skeleton-image` children.

### Section Heading

```html
<h2 class="section-heading">Project Financials</h2>
```

### Breakpoints for Responsiveness

- **1440px** - Full desktop layout
- **1024px** - Tablet layout, sidebar collapses
- **390px** - Mobile wide layout
- **360px** - Mobile narrow layout

All components respond to these breakpoints via the CSS custom properties system.