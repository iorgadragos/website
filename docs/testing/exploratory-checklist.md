# Exploratory test checklist (Claude in Chrome)

Run before the launch and after major UI changes, on the preview URL (or the live site after the cutover), in desktop
Chrome plus a phone-sized window. Record the run (date, URL, commit, findings) as a comment on the launch QA ticket
(iorgadragos/studio#14), and ticket every finding.

1. **First impression (home):** within 5 seconds, is it clear who this is for, what is offered and what to do next?
2. **Every page, top to bottom:** copy errors, placeholder text (`TODO`), broken or misleading links, inconsistent
   prices (`docs/strategy/offers-and-pricing.md` in the studio repo is the source), dates and currencies.
3. **The booking flow** (`/book/`): each Cal.com link opens the right event type; nothing loads third-party scripts
   on our pages (no cookies; the CSP holds; check the console).
4. **Navigation:** header, footer, skip link, back button; the current page is marked; nothing is a dead end.
5. **Mobile:** tap targets, line length, no horizontal scroll, images and code blocks fit.
6. **Keyboard and screen reader:** tab order, visible focus, headings in order, link names make sense alone.
7. **Errors:** a mistyped URL gives the 404 page with a way home; `www.` redirects to the apex keeping the query
   (after the cutover).
8. **Trust signals:** legal page (entity, CUI, VAT), privacy wording, contact email, no mention of the current client.
