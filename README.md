# Morphogen

A research bench for watching a runtime planner assemble industrial and enterprise
interfaces from reusable widgets. Every regeneration replans the whole page, not just the app.
That covers the app's layout, hierarchy, workflow, navigation and interaction model, and also
the page's colours, typefaces, panel style, where each instrument lives, the form and position
of the controls, and the transition between pages. The goal can stay the same throughout.

Open `index.html` in a browser. There is nothing to install.

## How it works

`plan({ goalId, seed, ctx, locks })` is a pure function that returns a UI plan. It runs these stages:

1. **Intent** binds the goal to a domain pack.
2. **Interaction, workflow, partition, navigation** are each sampled with softmax over context scores. Entropy sets the temperature.
3. **Widget selection** covers the capabilities each step needs from a 29-widget catalog, then adds more up to a device budget.
4. **Validation** checks constraints and repairs the plan where it can.
5. **Layout** builds a container tree using one of 14 solvers. Five of them use no column grid: free field, hub and spokes, workflow spine, horizontal river and cascading sheets.
6. **Page** picks one of nine compositions for the page and assigns each instrument to a region, drawer, floating card or tab.
7. **Identity** generates a palette from one of ten moods, with a random shift. Every colour is checked for WCAG contrast and adjusted until it passes.

A novelty gate then rejects any candidate whose page composition, identity or layout matches the previous page,
or whose controls land in the same place. Consecutive pages are always different, and what you choose to hold fixed is left alone.

The planner is a seeded rule system. It makes no model calls, and all domain data is simulated.
Each decision has its own random stream, so holding one variable leaves the others' draws unchanged.

## Using the bench

| Control | What it does |
| --- | --- |
| Regenerate (`R`) | Same goal, new seed. Workflow progress carries over. The button moves, so `R` is the reliable way to press it again. |
| New goal (`G`) | Different goal and new seed. |
| Evolve (`E`) | Breeds variants of the current page and shows each new champion. See Evolution below. |
| Auto-regenerate | Regenerates every 6 seconds, with no selection. |
| Context sliders, device | Replan with the same seed, showing how context alone changes the UI. |
| Runtime events | Change the context mid-run and replan live. |
| Hold variables | Force a dimension, so you can vary one thing at a time. |
| X-ray (`X`) | Draws the generated tree on top of the running app. |
| Instruments | Opens the drawer or floating cards on pages that hide the instruments. |
| Design atlas | Samples 36 plans and shows the distribution of structures. |

The widget tree starts at the page, so it shows where each instrument was placed as well as the app.
Hovering a tree row highlights its widget, and hovering a widget highlights its row.
Selecting a widget shows the alternatives and the probabilities the planner weighed.

## Evolution

Regenerate samples a fresh design every time. Evolve breeds designs instead, using all three parts of evolution:

- **Inheritance:** a genome holds six strategy choices plus the seed of each decision stream, such as widget choice or colour and type. A child is an exact copy of its parent except where it was mutated.
- **Variation:** each child gets one to three mutations, or is a crossover of two elite parents.
- **Selection:** a population of eight keeps its best three each generation, and the shown page changes only when a better design appears.

Fitness comes from simulated operators at three skill levels around the current expertise setting. A design's score is 100 × 60 ÷ (60 + seconds) for runs that finish, so 50 means a minute. The time model covers finding, reading, acting, navigating, error recovery and reviewing the agent. It uses the catalog's density, novice-fit and touch-fit ratings, and any design that fails a constraint scores 0.

The chance of extra mutations shrinks while nothing improves, so the page settles. The run stops when it converges, usually within 20 to 30 generations. Changing the goal, device, expertise, autonomy, urgency or a held variable starts a new population.

The operator model is a stated heuristic and has not been validated with users, so the UI evolves to suit the model, not people. It also doesn't score colour, type or where instruments sit, so those genes drift without selection pressure.

## Metrics

Everything in Runtime metadata is computed from the plan or measured in the browser.
Predicted actions, density and novelty are simple heuristics defined in `src/planner.js`.
They are useful for comparing plans, but they have not been validated with users.
Novelty is half tree-shingle Jaccard distance and half the share of strategies that changed.

## Development

```sh
npm test        # planner, page, contrast, novelty and evolution invariants
npm run build   # inlines src/ into index.html and dist/artifact.html
```

| File | Contents |
| --- | --- |
| `src/packs.js` | Goals and simulated domain data |
| `src/planner.js` | Catalog, scoring, constraints, layout solvers, metrics |
| `src/page-plan.js` | Page compositions, generated identity and contrast, novelty gate |
| `src/evolution.js` | Genomes, mutation, crossover, simulated operators, generation loop |
| `src/evolution-view.js` | The Evolution instrument |
| `src/page-render.js` | Rebuilds the page from a plan, and keeps the controls off content |
| `src/widgets.js` | Widget renderers |
| `src/runtime.js` | Shell, navigation models, interaction surfaces, live state |
| `src/inspector.js` | Tree, workflow graph, blueprint, metadata, trace, atlas |
| `src/app.js` | Bench controller |
