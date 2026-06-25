---
"nextjs-metrics": minor
---

Add isolated `nextjs-metrics/prisma` and `nextjs-metrics/drizzle` subpath entry points
(with classic-resolution folder stubs), so importing one adapter never loads the other.
Restores the subpath layout that was dropped in the unscoped-packages refactor. The root
entry still re-exports both adapters for backward compatibility.
