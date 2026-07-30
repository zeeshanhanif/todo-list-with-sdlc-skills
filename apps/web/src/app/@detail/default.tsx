// Parallel-route fallback for the `@detail` slot (Next.js `default.js`
// convention): on a hard navigation or refresh, Next cannot recover an unmatched
// slot's state and renders this instead — or a 404 if it is missing.
//
// null is exactly right: with no task open the detail host contributes nothing
// and occupies no space, and on a direct load of /tasks/{id} the full page in
// `children` is the correct presentation, not a panel over it.
export default function DetailDefault() {
  return null;
}
