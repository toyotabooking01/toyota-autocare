# Toyota AutoCare appearance update

The supplied light/dark screenshots guide the local application's login, workspace navigation, and client dashboard. Existing API data, forms, confirmation flows and role navigation are preserved; no backend edits or deployment were made.

- Light/dark controls are available in both headers. Preference persists in localStorage across navigation, refresh and logout. Without a saved choice, the operating-system preference supplies the initial mode.
- MUI palettes and shared CSS tokens cover forms, dialogs, dropdowns, cards, status labels and all role workspaces. Theme changes retain entered values.
- The workspace search locates existing pages for the current role; it does not claim to search server records.
- Vehicle cards use vehicle icons, avoiding misleading model-specific stock photos for user vehicles. Empty states use actual API data rather than the sample records in the reference.
- Desktop and 390px mobile layouts, theme persistence and typing after theme changes are covered by the existing browser regression test. Set CLIENT_SCREENSHOTS=1 to save local preview images to client/screenshots.

## Generated visual

Built-in image_gen tool; saved asset: `src/assets/autocare-scenic.png`. The image is decorative campaign artwork, not a vehicle record photo. Dark mode applies a CSS lighting treatment to the same artwork.

Final prompt:

Use case: ads-marketing. Asset type: Toyota AutoCare website photographic hero background, landscape 1536x1024. A silver Toyota RAV4 SUV driving along a smooth scenic road beside an alpine lake and majestic mountains at golden hour. Premium automotive campaign photography, realistic reflections, subtle motion blur in road, crisp vehicle, warm sunlight with slate blue mountains. SUV in lower center-right, entire car visible; upper half spacious sky and mountains for UI overlay. No text, no UI, no watermark. The image will serve both a light and dark themed automotive service website.
