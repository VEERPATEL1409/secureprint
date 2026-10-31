# SECUREPRINT - Phased Implementation Plan

This implementation plan adheres strictly to the 18 development stages mandated in the SecurePrint engineering specification.

---

## Stage Breakdown

### Stage 1: Project Audit & Architecture Setup
- [x] Initial codebase audit (`PROJECT_AUDIT.md`)
- [x] High-level architectural specification (`ARCHITECTURE.md`)
- [x] Phased implementation schedule (`IMPLEMENTATION_PLAN.md`)
- [ ] Dependencies installation (`react-router-dom`, `firebase`, `qrcode.react`)
- [ ] Project directory modularization (`src/layouts`, `src/routes`, `src/components`, `src/services`, `src/types`, etc.)

### Stage 2: Centralized Design System & Public Website
- [ ] Design Tokens & System (`src/styles`, reusable typography, color tokens, button variants, card styles, badges, modals, toast system)
- [ ] Public Layout (`PublicHeader`, `PublicFooter`, `AppShell`)
- [ ] Public Pages:
  - Home (`/`) with Hero ("Private document printing, made simple."), Product Visual, Problem, How It Works, Features, Security, FAQ, CTA
  - About (`/about`)
  - How It Works (`/how-it-works`)
  - Privacy Policy (`/privacy`)
  - Terms of Service (`/terms`)
  - Contact (`/contact`)

### Stage 3: Firebase Configuration & Blueprint
- [ ] Trigger `set_up_firebase` tool workflow
- [ ] Intermediate representation `firebase-blueprint.json` modeling all entities:
  - `shops`, `customerSessions`, `printJobs`, `printFiles`, `messages`, `blockedSessions`, `auditLogs`, `systemSettings`
- [ ] Firebase initialization service (`src/firebase/config.ts`, `src/firebase/context.tsx`)

### Stage 4: Shop Authentication & Lifecycle
- [ ] Shop Registration (`/shop/register`) with validation (Shop Name, Owner, Email, Phone, Address, GSTIN, etc.)
- [ ] Initial state assignment: role `shop`, status `pending`
- [ ] Shop Login (`/shop/login`) with role & status evaluation
- [ ] Pending Approval Screen (`/shop/pending-approval`)
- [ ] Forgot Password (`/shop/forgot-password`) with Firebase Auth password reset
- [ ] Strict Route Guards (`PublicRoute`, `ShopRoute`, `AdminRoute`, `CustomerSessionRoute`)

### Stage 5: Shop Dashboard & Navigation
- [ ] Shop Dashboard Layout (`ShopSidebar`, `ShopTopBar`, mobile drawer)
- [ ] Dashboard View (`/shop/dashboard`) with real Firebase live metrics:
  - Waiting Jobs, Printing, Completed Today, Active Sessions
  - Live Print Queue preview, Recent Activity
- [ ] Shop Status toggle (`OPEN` / `CLOSED`)

### Stage 6: Public Shop QR Code & Customer Onboarding
- [ ] Shop Public Profile & QR Generator (`/shop/qr`)
- [ ] Shop Public Landing (`/s/:shopPublicId`):
  - Shop name, status indicator, start printing trigger
- [ ] Temporary Customer Session Creation:
  - 6-digit Human-friendly token generation (e.g., `#482731`)
  - Session expiration calculation (`expiresAt = createdAt + 5 hours`)
  - Redirection to `/c/:sessionId`

### Stage 7: Customer Application & Messaging
- [ ] Mobile-first Full-screen Customer Interface (`/c/:sessionId`)
- [ ] Prominent Token display (`Token #XXXXXX`) & countdown timer
- [ ] Real-time two-way messaging between Shop and Customer (`printJobs/{jobId}/messages`)

### Stage 8: Real File Upload & Firebase Storage Integration
- [ ] Drag-and-drop & file picker supporting PDF, JPG, PNG, WEBP, DOCX, PPTX, XLSX
- [ ] Chunked/Resumable Firebase Storage uploads
- [ ] Granular progress indicators (0-100%) per file
- [ ] Cancel / Retry controls with upload failure states

### Stage 9: Shop Print Queue & Token Search
- [ ] Queue View (`/shop/queue`) with Firestore query filters (Waiting, Reviewing, Printing, Completed, Rejected, Expired)
- [ ] Real-time token and customer name search
- [ ] Customer Directory (`/shop/customers`)

### Stage 10: Document Preview & Print Settings
- [ ] Job Inspector (`/shop/jobs/:jobId`)
- [ ] Real PDF viewer with page navigation, zoom, and fit
- [ ] Image preview with high-fidelity rendering
- [ ] Non-PDF fallback handling ("Configuration required" notice for unconfigured converters)
- [ ] Print Settings panel (B&W/Color, Copies, Paper format, Simplex/Duplex, Page range)

### Stage 11: Print Workflow & Execution
- [ ] State Machine enforcement: `WAITING` → `REVIEWING` → `PRINTING` → `PRINTED`
- [ ] Confirmation modal before printing ("Print X copies of Y in Z?")
- [ ] Browser print dialog integration via secure print preview iframe/window
- [ ] Double-click and duplicate action guards

### Stage 12: File Replacement & Deletion Mechanics
- [ ] Customer file deletion with Storage removal and Firestore metadata updates
- [ ] Customer file replacement with stale-preview cache busting
- [ ] Race-condition protections (lock mutation if status is `PRINTING` or `PRINTED`)

### Stage 13: 5-Hour Authoritative Server-Side Cleanup
- [ ] Scheduled cleanup logic and Cloud Function definitions in `/functions`
- [ ] Client-side visual countdown with automatic expired-state lock
- [ ] Idempotent cleanup job architecture

### Stage 14: Session Blocking & Abuse Prevention
- [ ] Shop abuse blocking tool (`/shop/blocked`)
- [ ] Reason taxonomy (Spam, Abuse, Malicious File, Misuse, Other)
- [ ] Immediate session termination for blocked sessions

### Stage 15: Administration Console
- [ ] Admin Login (`/admin/login`)
- [ ] Admin Dashboard (`/admin/dashboard`): Metrics, shop growth, storage quotas
- [ ] Shop Approval & Management (`/admin/shops`, `/admin/shops/:shopId`)
- [ ] Global System Settings (`/admin/settings`) & Audit Log Explorer (`/admin/audit-logs`)

### Stage 16: Zero-Trust Security Rules & Storage Rules
- [ ] Comprehensive `firestore.rules` adhering to the 8 Pillars
- [ ] Storage rules for file privacy (`storage.rules`)
- [ ] Rule deployment via `deploy_firebase`

### Stage 17: Multi-Device Responsive Polish & Accessibility
- [ ] Breakpoint verification (360px, 390px, 768px, 1024px, 1440px)
- [ ] ARIA labels, semantic markup, keyboard navigability

### Stage 18: Final Quality Assurance, Verification & Demo Run
- [ ] End-to-end testing across Shop, Customer, and Admin personas
- [ ] Project documentation suite (`README.md`, `SECURITY.md`, `DATABASE_SCHEMA.md`, etc.)
