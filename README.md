# Fudgel

**The Meta-Language of Intent.** Orchestrating complexity by doing "nothing" at all.

[fudgel.org](https://fudgel.org/) | [Live IDE Demo](https://fudgel.org/ide.html)

---

## What is Fudgel?

Fudgel is a meta-language of intent. It is not a general-purpose programming language. It does not compute, render, allocate memory, or manage time. It describes the structure, logic, and data flow of an application in three distinct sub-languages — each with a single job — and compiles that description directly to bare-metal instruction sets with no intermediate abstraction layer.

Fudgel programs are deterministic by construction. Because Bija is fully resolved at load time, Rumus functions are pure, and Viesti resolves signals in declaration order, the same input state always produces the same output. Non-determinism can only be introduced explicitly through a library.

> *Core Law: if you need logic, write a Rumus function. If you need to remember something, write it to a Bija entity. Viesti connects the two. Nothing else exists.*

---

## The Trinity

Fudgel is composed of exactly three sub-languages, each with a single responsibility. No sub-language can perform the role of another. This separation is enforced by syntax.

| DSL | Layer | Single Responsibility | What it cannot do |
|---|---|---|---|
| `Bija` | State | Stores all state as a static entity tree. No logic, no operations. Human-readable names are discarded at runtime — every entity becomes a fixed memory address. | Execute logic or route data |
| `Rumus` | Logic | Pure, finite functions that operate exclusively in registers. Reads no memory, writes no memory. Everything it touches is gone when it returns. | Store state or route data |
| `Viesti` | Wiring | Connects Bija addresses to Rumus functions and writes results back to Bija. Supports sequential and parallel execution through a two-symbol syntax. | Store state or execute logic |

### File Types

A file's type is defined by its Trinity imports:

| File Type | Required Imports | Description |
|---|---|---|
| Application | `@Bija` `@Rumus` `@Viesti` | Complete executable. First signal under `@Viesti` is the entry point. |
| Library | `@Bija` `@Rumus` | Templates and functions. No `@Viesti` — wiring is the consumer's concern. |
| Data file | `@Bija` | Pure state declaration. No logic, no signals. |

---

## Full Example — All Three DSLs

```
@Bija
@Ehto

Player;
  health: 100 {required}

@Rumus
? clamp{x, min, max};
  belowMin: x < min ? min : x
  result: belowMin > max ? max : belowMin
  ~result

@Viesti
Player.health ~ clamp ~ Player.health
```

---

## Bija — The State Layer

Bija is the entire heap of a Fudgel application. It is the only place where state persists across function calls. All Rumus functions read from and write to Bija entities. All Viesti signals reference Bija addresses.

At runtime, every human-readable name in a Bija file is discarded. The load-time pass assigns each entity and property a fixed memory offset. All subsequent references become raw pointer arithmetic.

Bija values are always atomic. A value is a literal, a reference, a shorthand token, or `empty`. It is never an expression. `damage: #attack + 20` is a syntax error — that computation belongs in Rumus.

### Bija Example

```
@Bija
@Ehto

Player;
  name: Kael
  health: 180 {required}
  mana: 90 {required}
  startingHealth: =Config.maxHealth
  inventory;
    loot: -
      gold
      gem
      potion
    equippedItem: #loot.0
  stats;
    strength: 10
    agility: 8

Enemy;
  health: 80
  behaviour: passive

TemplateItem;
  value: 0
  weight: 1

Sword: #TemplateItem | 15, 3 |
  durability: 100

Shield: #TemplateItem | 5, 8, 200 |

Scene;
  basicEnemies: #Enemy !5
  eliteWave: #Enemy !3 | 200, aggressive |

Config;
  maxHealth: 100 {immutable}
  version: 1 {immutable}

UI;
  shownHealth: =Player.health
```

---

## Rumus — The Logic Layer

Rumus is a pure transformation notation. A Rumus function takes named inputs, applies a transformation, and exposes outputs. No side effects, no memory allocation, no loops, no branching. It describes what a computation is, not what a substrate does to perform it.

Rumus functions operate exclusively in registers. No heap allocation occurs inside a Rumus function. When a function returns, every intermediate value is gone. Garbage collection is an inapplicable concept — there is nothing to collect.

Formal logic assertions (`->`, `<->`, `^`, `!&`, `!|`, `<-`) are constraints that must hold at function evaluation. If an assertion fails, execution halts with the function path and the specific assertion that broke. They make IDE function cards into interactive proof tools.

### Rumus Example

```
@Rumus
@rumus-riscv

(--- Roll vs defense: did the hit connect? ---)
? hitCheck{roll, defense};
  threshold: defense - 5
  hit: roll >= threshold ? 1 : 0
  ~hit

(--- Crit probability: luck-scaled ---)
? critCheck{luck, roll};
  chance: 60 + luck
  crits: roll * 6 > chance ? 1 : 0
  ~crits

(--- Strike: apply crit multiplier and armor reduction ---)
? strikeCalc{baseDmg, armor, isCrit};
  reduced: baseDmg - armor
  multiplied: isCrit = 1 ? reduced * 2 : reduced
  dmg: multiplied < 1 ? 1 : multiplied
  ~dmg

(--- Apply damage to target health ---)
? takeDamage{health, dmg};
  result: health - dmg
  health > 0 -> result >= 0
  remaining: result < 0 ? 0 : result
  ~remaining

(--- State machine: combat phase transition ---)
? transitionCombat{current, incoming};
  isIdle:   current = idle
  isCombat: current = combat
  isDead:   current = dead
  isDead !& isCombat
  isIdle -> incoming = combat
  isDead -> incoming = dead
  next: isDead ? current : incoming
  ~next
```

---

## Viesti — The Signal Layer

Viesti is the wiring of the application. It defines which data flows where. It does not compute. It does not store. It does not schedule. It routes.

Signal order is execution order. Writing signals is simultaneously writing the execution schedule. Deterministic execution order is a direct consequence of file structure, not something the runtime computes.

`~` means *this depends on that*. `~~` means *these have no dependency on each other*. A signal resolves when its source address has data available — pull model, not push. A function cannot execute until all of its parameter addresses have been populated.

### Viesti Example

```
@Viesti

(--- Sequential: seed the hit check ---)
Hero.luck ~ hitCheck.roll ~ Hero.luck

(--- Parallel cluster: crit check + armor lookup ---)
Hero.luck ~~ critCheck.luck
    Battle.round ~ critCheck.roll
    Hero.attack ~~ strikeCalc.baseDmg
        Config.armorBase ~ strikeCalc.armor
        critCheck ~ strikeCalc.isCrit
    Boss.health ~~ takeDamage.health
        strikeCalc ~ takeDamage.dmg

(--- Sequential: apply damage ---)
takeDamage ~ Boss.health

(--- Sequential: phase transition ---)
Boss.health ~ phaseCheck.health
Config.maxHealth ~ phaseCheck.maxHp
phaseCheck ~ Boss.phase

(--- Dormant: xp formula not yet wired ---)
Battle.lastDmg ~ xpGain.dmg
Battle.round ~ xpGain.round
xpGain ~
```

---

## Quick-Reference Cards

### Bija Symbols

| Token | Meaning |
|---|---|
| `EntityName;` | Entity declaration |
| `name: value` | Property |
| `name: empty` | Explicit empty value |
| `#Entity.prop` | Alias (same address, resolved at compile time) |
| `=Entity.prop` | Value copy (copied at parse time, source forgotten) |
| `\| v1, v2 \|` | Positional override |
| `!N` | Multiplier — stamp N instances |
| `-` | Ordered list marker |
| `*` | Unordered list marker |
| `{flag}` | Metadata boolean |
| `[...]` | Literal string (no parsing inside, may span lines) |
| `(...)` | Comment |

### Rumus Symbols

| Token | Meaning |
|---|---|
| `? Name{p1, p2};` | Function declaration |
| `name: expr` | Named binding (let) |
| `~name` | Output declaration |
| `#Entity.prop` | Live Bija read (compiler expands to inbound signal) |
| `+ - * / %` | Arithmetic |
| `-x` | Unary negation |
| `= != < > <= >=` | Comparison (`=` is equality, not assignment) |
| `& \| !` | Boolean AND / OR / NOT |
| `a ? b : c` | Conditional |
| `a -> b` | Implication assertion |
| `a <-> b` | Biconditional assertion |
| `a ^ b` | Exclusive or assertion |
| `a !& b` | NAND assertion |
| `a !\| b` | NOR assertion |
| `a <- b` | Converse implication assertion |

### Viesti Symbols

| Token | Meaning |
|---|---|
| `A ~ B ~ C` | Sequential signal chain |
| `A ~~ B` | Parallel signal (concurrent with peer `~~` signals) |
| `A ~ B ~` | Dormant signal (no target) |

---

## Compilation-Pass Libraries

These libraries use Bija syntax for their declarations and run during the compiler's library pass stage, operating on the full expanded application state.

The compilation pipeline is ordered:

1. **Bija parsing** — produces a flat entity tree. No semantics assigned.
2. **Library passes** — each participating library runs its Rumus functions over the entity tree in import declaration order. Any pass that returns false halts compilation and surfaces the failing entity path.
3. **PAF emission** — the validated entity tree is compiled to binary format. Names are discarded. Addresses are assigned.

| Library | Role |
|---|---|
| `@Ehto` | Validation constraints on Bija entities. Type checking and constraint enforcement during the compilation pass. |
| `@Primi` | Primitive type constraints and structural rules for the Bija layer. |
| `@Peril` | Parallelism verification. For each `~~` pool, Peril runs signals in both possible orderings and compares outputs. Matching outputs prove independence. Differing outputs halt compilation. Optional — including it means every `~~` is compiler-verified rather than author-asserted. |

---

## Domain Libraries

### Target Libraries

Pair with `@Rumus` to define what operations are available for a given execution substrate:

| Library | Description |
|---|---|
| `@rumus-riscv` | Numeric arithmetic and comparison primitives for RISC-V execution. Current working target. |
| `@rumus-wgsl` | Planned. Shader operation primitives for GPU execution via WGSL. |
| `@rumus-llvm` | Planned. LLVM IR emission for broad hardware coverage. |

### Standard Libraries

Substrate-agnostic semantic abstractions built on top of whichever target is in scope. Each library is agnostic — it does not know other libraries exist. It knows only how to operate on the Bija state it is given.

| Library | Meaning | Responsibility |
|---|---|---|
| Tipus | Type | User input handling |
| Ehto | Constraint | Type checking and validation |
| Primi | First | Memory management |
| Peril | Peril | Parallelism verification — proves `~~` independence at compile time |
| Lifga | Revive | Timing, sequences, animation — the only library that introduces time |
| Aquilla | Eagle | Visibility and framebuffer rendering |
| Kadro | Frame | Layout and structural templates |
| Smink | Makeup | Styling, formatting, and theming |
| Rezo | Network | High-performance network handling |
| Zapis | Record | File system and database I/O |
| Nesen | Nest | Dynamic entity allocation — operates in a separate memory pool |
| Giya | Guidance | Accessibility and semantic markers |
| Hloov | Change | Translation and localisation |
| Kani | Sound | Audio processing and playback |
| Pismo | Font | Text formatting and typography |
| Cead | Permission | User access control and security |
| Nyem | Squeeze | Compression and storage |
| Drysu | Tangled | Encryption and cryptographic safety |

---

## The PAF — Published Application Format

The PAF is the compiled, binary-efficient output of a finalised Fudgel application. It is a shipping format, not a development format.

- **No source names, no type information, no runtime interpreter.** The Fudgel Runtime maps it into memory and begins executing from the first signal.
- **Declared memory footprint.** The PAF header states the total memory required. The runtime allocates this once on load. There is no allocator at runtime — the compiler made every allocation decision.
- **Variable-width entity blocks** with an index for O(1) lookup by entity address rather than O(n) traversal.
- **PAF space vs. Nesen space.** A program that does not import Nesen has provably no dynamic allocation, no GC, no runtime memory management of any kind. Nesen operates in a separate memory pool with distinct address ranges.

### Header Structure

```
[total_memory_footprint]   — runtime allocates this once
[entity_count]             — length of the index
[entity_start_offsets]     — flat array, one value per entity
[signal_count]             — length of signal table
[signal_table]             — flat array of address pairs
[data_region_offset]       — where bulk bytestreams begin
```

---

## The Fudgel IDE

The Fudgel IDE is a multitab environment that presents the application as a live schema — a node graph of the Bija entity tree and Viesti signal graph that actually runs. It is the application, rendered as a readable structure, executing in real time or at controllable speed.

- **Read-only graph view.** The canonical source of truth is always the code the developer writes. The graph renders what is already true about the program.
- **Code-to-graph navigation.** Selecting a node in the graph view jumps to the Bija entity or Viesti signal that defines it. Editing the source updates the graph immediately.
- **Library tabs.** Each domain library gets its own IDE tab — the render library tab shows visual layout, the signal library tab shows timing and event flow, the type library tab shows constraint validation state.

The IDE is built with plain HTML, CSS, and JavaScript and can be served statically.

**[Try the live demo](https://fudgel.org/ide.html)**

---

## Key Features

- **Deterministic by construction** — The same input and orchestration always yields the same state. Non-determinism can only be introduced explicitly through a library.
- **Signal-based concurrency** — `~` for sequential, `~~` for parallel, with implicit barriers defined by indentation. No locks, no mutexes, no race conditions in correctly declared graphs.
- **ECS architecture** — Flat memory layout borrowed from game engine design. All state in Bija entities, all logic in Rumus functions, all wiring in Viesti signals.
- **Substrate-independent** — The same source targets RISC-V today, WGSL and LLVM tomorrow. Rumus core is hardware-agnostic; target libraries provide the instruction mappings.
- **No GC, no runtime allocator** — Bija is allocated at load time. Rumus operates exclusively in registers. There is nothing to collect.
- **Invalidation-based rendering** — No polling at 60fps. A signal fires, Aquilla resolves the affected region, pixels update, execution stops. Zero CPU at idle.

---

## Build Order

| Stage | Deliverable |
|---|---|
| 1. Core compiler | Parser for Bija, Rumus emitter targeting RISC-V, Viesti graph builder including parallel pool resolution. The minimum needed to produce a valid PAF from source. |
| 2. MVP visualiser | Read-only graph renderer showing the live Bija entity tree, Viesti signal flow, and parallel execution clusters. Makes the language legible to contributors. |
| 3. Base libraries | Ehto (type/constraint), Primi (memory), Lifga (timing), and a base iteration library. Enables real programs to be written. |
| 4. Domain libraries | Aquilla, Kadro, Smink, and the remaining domain-specific libraries, developed in order of need. |
| 5. Full IDE | Multitab environment with domain library tabs, built reactively from what each library proved it needs to show. |

---

## Why "Fudgel"?

Derived from the archaic English word meaning "to pretend to work when in reality one is not doing anything." Fudgel is the ultimate "lazy" orchestrator. It doesn't perform calculations, it doesn't paint pixels, and it doesn't manage memory. It simply describes the intent, allowing the engine to handle the heavy lifting with game-engine efficiency.

---

## Contributing

Fudgel is a part of the [ProtoSpeech Foundation](https://fudgel.org/). If you are interested in the intersection of ECS, functional programming, and high-performance UI orchestration, we'd love to hear from you.
