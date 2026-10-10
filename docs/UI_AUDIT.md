# Checkpoint 15 UI audit

Scope: the routes registered in `client/src/main.tsx`, shared layouts/components,
and their Student, Trainer and Admin variants. Existing business rules and backend
APIs are unchanged. The unused historical `Dashboard.tsx` is not a registered page
and was not substituted for the working dashboards.

## Confirmed findings and fixes

| Finding | Fix | Verification |
|---|---|---|
| Saved transcript speaker caption failed contrast | White text on the existing purple answer bubble | Re-audited saved transcript at phone/desktop widths |
| Missing favicon caused a browser resource error | Local Disha360 SVG favicon | Browser asset request and production build |
| Pale helper/footer/sidebar text failed contrast; some slate-500 text on the page background narrowly failed 4.5:1 | Scoped darker text and readable placeholders, preserving dark marketing-panel colors | Chromium axe WCAG checks |
| Hidden mobile sidebar links were keyboard reachable | Closed drawer is inert; named modal navigation, expanded/control attributes, inert background | Browser keyboard and accessibility checks |
| Drawer lacked Escape, focus containment/restoration and background scroll locking | Shared drawer hook traps Tab/Shift+Tab, handles Escape, restores opener and scroll, handles desktop breakpoint | Keyboard workflow and five viewport sizes |
| Long breadcrumb and account text competed at narrow widths | Compact mobile breadcrumb, bounded account name, flexible min-widths | 320/375px checks |
| Skip link target could not reliably receive focus; direct protected links load asynchronously | Focusable main, route focus/title/announcement manager watches asynchronous mounts | Direct URL, refresh and in-app navigation |
| Textareas and disclosure summaries omitted from shared focus styles | All interactive controls have visible focus; reduced motion remains respected | Keyboard inspection and CSS regression review |
| Skeletons were hidden without a loading announcement | Named status text with decorative blocks hidden | Automated rendering tests and browser loading checks |
| Registration field errors were not all described; password mismatch did not move focus | Associated error IDs, alert messages and first-invalid-field focus | Real form validation; no registration API call for mismatched passwords |
| Pre-filled textarea labels included their saved content | Explicit stable names for code, resume sections, assessment questions/instructions, learning content and batch description | Browser editor and question-editing checks |
| Repeated resume Add buttons lacked section-specific names | Distinct accessible Add education/projects/experience/certifications actions | Automated tests |
| Tables needed keyboard access to their horizontal scrolling area | Named focusable scroll regions, column scope, internal table scrolling | Browser table/keyboard checks |
| Small controls, intrinsic grid sizing and mobile input text needed consistent behavior | 44px button/input/choice-label targets, min-width handling, readable mobile inputs | Five-width checks |
| Monaco line numbers failed contrast; keyboard/touch users needed an alternative | High-contrast light theme with readable dimmed line numbers, screen-reader support, keyboard help, plain editor using the same drafts, load-error boundary | Actual editor loading, four-language draft save/restore |
| Authentication marketing content delayed the mobile form and described obsolete future capabilities | Form first on mobile; proper main heading; concise current copy | Login/register at five widths |
| Learning selection was only visual | Lesson navigator exposes current step | Browser and source review |

Native browser confirmation dialogs remain in use for destructive actions. They
use browser-managed focus and keyboard behavior; no untested custom modal was
introduced. Existing inline success statuses and alert/retry components remain;
no additional toast or UI library is needed.

## Route checklist

The final browser matrix covers these families with real authenticated requests
against disposable MongoDB. List pages include real records where available and
honest empty states elsewhere; no API success responses are mocked.

| Role | Pages |
|---|---|
| Public | Login, Student registration |
| Student | Dashboard; resume directory/new/edit/preview/PDF; ATS analyzer/history; interview setup/history/saved transcript/feedback unavailable; assessment directory/instructions/active attempt/final result; analytics; coding playground/problem directory/challenge/submission history; learning library/reader; company directory/detail/checklist; leaderboard/public profile; achievements/streaks |
| Trainer | Dashboard; batches/detail; Student directory/detail; assessment directory/new/editor/question authoring/CSV; learning directory/new/editor/assignments/completion; assignment directory; reports/export; leaderboard/authorized achievements |
| Admin | Dashboard; batches/detail/creation/trainer assignments; Student directory/detail; assessment directory/new/editor/CSV; learning directory/new/editor/assignments/completion; assignments; institution reports/export; Trainer workloads; leaderboard/statistics/achievements |

Widths: **320, 375, 768, 1024, 1440 CSS pixels**. Tables and code may scroll inside
named regions; the document itself must not overflow. Every registered sidebar
link resolves to its authorized route. The rich editor remains lazy-loaded.

## Repeating locally

1. Use a private development database and documented explicit account/resource
   provisioning. Do not test by editing production records.
2. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`.
3. Walk the route checklist as each role at all five widths. Check document
   overflow, table scrolling, labels, errors, zero/empty states and navigation.
4. With keyboard only, use the skip link, open navigation, cycle Tab/Shift+Tab,
   press Escape and follow a navigation link. Confirm focus restoration, main
   focus and visible outlines. Resize an open drawer to desktop.
5. Create/save/edit a resume and download its real PDF; run an ATS-style analysis;
   complete an assessment; complete learning; toggle and refresh a company item.
6. Save/refresh drafts in all four languages, with both editor modes. Run/submit
   remains disabled without a real isolated execution provider.
7. As staff, author/import/publish/assign assessments, create batches, assign
   trainers/learning, filter reports and download actual CSVs. Confirm unrelated
   Trainer resources remain denied.
8. Check loading and network-error recovery with browser network tools. Repeat
   with reduced-motion enabled. Automated browser audit tools are development
   tools only and are not application dependencies.

## Limits of verification

Automated accessibility checks and Chromium keyboard tests do not constitute a
formal WCAG certification or manual NVDA/VoiceOver audit. Safari/iOS, Firefox,
real touch devices and microphone permissions require additional device testing.
Live OpenAI interviews/feedback and Judge0 execution are unverified; setup-required
states are tested, and no successful provider output is invented. PDF resource
uploads remain unavailable without secure storage. The existing lazy Monaco
chunk-size advisory is unchanged; the plain editor is available without it.


## Final results

**55 route views** (public, Student, Trainer, Admin) passed the five-width matrix:

| Width | Layout checks | Document overflow |
|---:|---:|---:|
| 320 | 55 | 0 |
| 375 | 55 | 0 |
| 768 | 55 | 0 |
| 1024 | 55 | 0 |
| 1440 | 55 | 0 |

Axe WCAG 2 A/AA and 2.1 AA rules ran on phone/desktop routes. Targeted saved
transcript and published coding challenge reruns checked all five widths. **No
remaining reported violations**, nonempty unexpected alerts, page exceptions or
console errors. Initial missing-favicon, transcript-caption and folded-line-number
findings were fixed and rerun. One initial coding detail returned the correct
not-found response because the disposable fixture was unpublished; explicitly
publishing that labeled test fixture restored the actual page. This was a fixture
setup correction, not a permission bypass or application backend change. No live
code execution or generated AI feedback was invented.

Actual browser interactions passed: all role logins/redirects/logout; drawer
Tab/Shift+Tab/Escape/main focus; registration mismatch focus; three resume templates,
actual PDF download and ATS analysis; assessment selection/manual submission/results;
four language drafts/custom input/save/refresh; learning completion; checklist
persistence and achievements; Admin batch/trainer assignment; Admin/Trainer assessment
creation, manual question creation/editing, CSV template/import, publishing/batch
assignment; learning assignment; scoped reports/actual CSV exports; workload controls.
The active assessment also passed layout checks at all five widths before submission.
Missing AI feedback and Judge0 are explicitly unavailable. Deliberate network aborts
and rich-editor import failure tested Retry/fallback without mocking success.
Reduced-motion and open-drawer desktop resizing passed. Mobile Student and desktop
Admin screenshots were captured for visual review.

`npm test`: **248 passing** (222 server, 26 client), preserving all 243 baseline
tests plus five new UI accessibility tests. All source/test TypeScript checks and
both production builds pass. All writes used disposable test databases; application
backend files and production data remain unchanged. No commit or push performed.
