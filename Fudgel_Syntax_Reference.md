# Fudgel Syntax Reference — v10

> **v10 note:** All operator symbols now reflect the actual implemented syntax as found in the IDE parsers. v9 referred to several operators by keyword names (`and`, `or`, `not`, `xor`, `nand`, `nor`) and used word-style formal-logic tokens (`=>`, `<=>`) that the parser does not recognise. The correct symbolic forms are documented throughout this version. Examples have been updated to match.

---

## Overview — The Trinity

Fudgel is composed of three layered DSLs. Each has a distinct role and a distinct parser. They share the same file, separated by `@` import markers.

| Layer | DSL | Role |
|---|---|---|
| State | **Bija** | Static entity tree. Stores all application state. No logic, no expressions. |
| Logic | **Rumus** | Pure transformation functions. No side effects, no memory, no branching. |
| Wiring | **Viesti** | Signal routing. Connects Bija addresses through Rumus functions. |

A Fudgel file is defined by which Trinity DSLs it imports:

| File Type | Required Imports | Description |
|---|---|---|
| Application | `@Bija` `@Rumus` `@Viesti` | Complete executable. First signal under `@Viesti` is the entry point. |
| Library | `@Bija` `@Rumus` | Templates and functions. No `@Viesti` — wiring is the consumer's concern. |
| Data file | `@Bija` | Pure state declaration. No logic, no signals. |

---

## @ — Import and Section Marker

```
@Bija
@Rumus
@Viesti

@path/to/library
@../shared/myUtils
```

`@` has one universal meaning: bring this into scope. It applies to Trinity DSLs, compilation-pass libraries (`@Ehto`, `@Primi`, `@Peril`), and domain libraries. Every Fudgel file must declare its imports explicitly.

Trinity imports also act as **section markers** — declarations following a Trinity import belong to that layer's scope. Import order is declaration order is compilation-pass order.

---

## Comments

```
(this is a comment and is ignored by the parser)
```

Parentheses delimit comments in all three DSLs. Comments may appear anywhere, including inline. Nesting is supported.

---
---

## Bija — State Layer

Bija is a static entity tree. It stores all application state. It contains no logic, no operations, and no expressions. The parser is deliberately simple — meaning arises from structure alone.

Every piece of shorthand syntax in Bija follows the same methodology: the parser recognises a token pattern and mechanically expands it into the equivalent verbose form. There is no evaluation, no arithmetic, no logic — only pattern recognition and expansion.

**Bija values are always atomic.** A value is a literal, a reference, a shorthand token, or `empty`. It is never an expression. `damage: #attack + 20` is a syntax error. If a value must be derived from other values, that computation belongs in Rumus and the result is written back to Bija by a Viesti signal.

---

### Entities

```
EntityName;
```

Named containers. End with a semicolon. Indentation denotes parent-child hierarchy.

---

### Properties

```
propertyName: value
```

Always `name: value`. Belongs to the most recently declared entity. Value is a literal, a reference, a shorthand token, or `empty`. Never an expression.

---

### Empty Value

```
propertyName: empty
```

The explicit empty value. No inference occurs.

---

### References — `#`

```
#EntityName
#EntityName.property
#list.0              (ordered index)
```

`#` means "these two things are the same thing." The compiler resolves the alias to the same memory address and removes it. No indirection survives into the compiled output. Digits are reserved — property names must begin with a letter.

---

### Value Copy — `=`

```
propertyName: =Entity.property
```

Copies the referenced property's value at parse time. The source is forgotten — not an alias, not a live link. If the source changes at runtime, this property does not change with it.

---

### Instantiation

```
NewThing: #TemplateName
```

Copies the referenced entity's full structure at parse time, including all sub-entities and their properties. Fully independent after instantiation.

---

### Positional Shorthand — `| v1, v2 |`

```
(inline entity declaration — structure and values in one line)
Stats | strength, agility, luck |;

(template instantiation with value overrides)
Sword: #TemplateItem | 15, 3 |
```

The `| value1, value2 |` pipe shorthand assigns property values positionally.

The **semicolon** distinguishes the two uses:
- `Entity | p1, p2 |;` — entity declaration, creates the entity with those properties
- `prop: #Template | v1, v2 |` — property assignment with template override

On a template instantiation, positional values override the corresponding template properties for that instance only. Properties not covered retain their template defaults.

```
TemplateItem;
  value: 0
  weight: 1
  durability: 100

(override value and weight — durability stays 100)
Sword: #TemplateItem | 15, 3 |

(override all three)
Shield: #TemplateItem | 5, 8, 200 |
```

---

### Multiplier — `!N`

```
groupName: #TemplateName !5
```

Stamps out N independent instances at parse time. The count must be a literal integer. Each instance is fully independent in compiled memory.

```
(compiler expands to)
groupName;
  TemplateName_0: #TemplateName
  TemplateName_1: #TemplateName
  TemplateName_2: #TemplateName
  TemplateName_3: #TemplateName
  TemplateName_4: #TemplateName
```

Addressable as `#groupName.0` through `#groupName.4`. Combinable with positional shorthand for homogenous sets:

```
wave: #Enemy !5 | 200, aggressive |
```

If each instance requires different values, write them explicitly.

---

### Anonymous Lists — `-` and `*`

```
(ordered — author writes)
loot: -
  gold
  gem
  potion

(parser expands to)
loot;
  0: gold
  1: gem
  2: potion

(unordered — author writes)
flags: *
  active
  visible
  collidable

(parser expands to)
flags;
  active: empty
  visible: empty
  collidable: empty
```

The `-` marker creates numbered sub-entities with their values. The `*` marker creates named sub-entities with **empty values** — the names are the data, not labels for values. Both resolve at parse time. Ordered items are addressable by index: `#loot.0`, `#loot.1`, etc.

---

### Metadata Booleans — `{flag1, flag2}`

```
propertyName: value {flag1, flag2}
```

Expands to:

```
propertyName: value
  flag1: true
  flag2: true
```

Only booleans belong inside `{}`. Presence equals true. Bija has no privileged boolean keywords — `{required}`, `{immutable}`, `{unique}` are all plain sub-entities. Their meaning is supplied entirely by the library that reads them during the compilation pass.

---

### Literal Strings — `[...]`

```
propertyName: [literal text content
that may span multiple lines]
```

Square brackets denote a literal value. No parsing occurs inside. May span multiple lines.

---

### Reference Semantics Summary

| Syntax | Name | Behaviour |
|---|---|---|
| `#Entity.property` | Alias | Compiler resolves to same address. Reference removed. No runtime indirection. |
| `=Entity.property` | Value copy | Value copied at parse time. Source forgotten. Independent at runtime. |

Neither creates a live link. Bija is fully static after load.

---

### Full Bija Example

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
---

## Rumus — Logic Layer

Rumus is a pure transformation notation. A Rumus function takes named inputs, applies a transformation, and exposes outputs. No side effects, no memory allocation, no loops, no branching.

**Rumus core** defines transformation primitives with no substrate assumptions. **Target libraries** declare substrate-specific instruction mappings. The current working target is `@rumus-riscv`.

The five operation domains (arithmetic, comparison, boolean, conditional, formal logic) are exhaustive for pure transformation of known values. Any reasoning that requires unknown, uncertain, or temporally contingent values belongs at a layer boundary, not inside a pure transformation function.

---

### Function Declaration

```
? functionName{param1, param2};
```

`?` prefix marks a Rumus function entity. Parameters use `{}` boolean shorthand — each expands to a sub-entity with value `true`. Viesti overwrites them with actual values before execution. A function cannot run unless all parameters have been supplied.

---

### Function Body

```
? functionName{param1, param2};
  intermediate: param1 + param2
  param1 > 0 -> intermediate > param1   (formal logic assertion)
  anotherStep: intermediate * 2
  ~anotherStep
```

Body properties are named intermediates (let-bindings). Formal logic assertions are interspersed where the relationships are relevant. The `~` line declares outputs.

---

### Output Declaration — `~`

```
  ~value

  ~value1, value2
```

`~` declares which values are exposed to Viesti. The only externally addressable values on a function entity.

---

### Calling Another Function

```
? normalise{x};
  clamped: #clamp | x, 0, 100 |
  result: clamped / 100
  ~result
```

- **Single caller** — inlined. No shared state surface. Determinism guaranteed.
- **Multiple callers** — subroutine. Prevents ambiguous register state across call sites.

This is a determinism guarantee, not an optimisation.

---

### `#` in Rumus

```
? applyScale{value};
  result: value * #Config.scaleFactor
  ~result
```

`#` inside Rumus means the value comes from a live Bija address. The compiler expands this to a Viesti inbound signal before emission. Rumus never reads Bija directly at runtime.

---

### Operator Reference

#### Arithmetic

| Operator | Meaning | Notes |
|---|---|---|
| `x + y` | Addition | |
| `x - y` | Subtraction | |
| `x * y` | Multiplication | |
| `x / y` | Division | |
| `x % y` | Remainder | Divisibility checks and wrapping |
| `-x` | Unary negation | Distinct from binary `a - b` |

#### Comparison

| Operator | Meaning |
|---|---|
| `x = y` | Equal |
| `x != y` | Not equal |
| `x < y` | Less than |
| `x > y` | Greater than |
| `x <= y` | Less than or equal |
| `x >= y` | Greater than or equal |

> **Note:** Equality in Rumus is a single `=`. It is a comparison, not assignment. Bija uses `=` for assignment; Rumus uses it for equality testing inside expressions.

#### Boolean

| Operator | Meaning |
|---|---|
| `a & b` | Boolean AND |
| `a \| b` | Boolean OR |
| `!a` | Boolean NOT |

> **v9 correction:** The boolean operators are symbols `&`, `|`, `!` — not the keywords `and`, `or`, `not`.

#### Conditional

```
a ? b : c
```

Produces a value — does not route behaviour. Valid only when both branches produce values of the same kind through pure transformation of inputs. Any selection that routes to meaningfully different behaviours belongs in Viesti.

#### @rumus-riscv — Target Mapping

| Rumus | Operation | RISC-V |
|---|---|---|
| `x + y` | Addition | ADD |
| `x - y` | Subtraction | SUB |
| `x * y` | Multiplication | MUL |
| `x / y` | Division | DIV |
| `x % y` | Remainder | REM |
| `x = y` | Equal | BEQ |
| `x < y` | Less than | BLT |
| `a ? b : c` | Conditional | Branch + label |

---

### Formal Logic — Assertions

Assertions are statements about relationships between truth values, scoped to function evaluation. They are **not expressions** — they are constraints that must hold. If an assertion fails at function evaluation, execution halts with the function path and the specific assertion that broke.

Assertions make the IDE function cards into interactive proof tools. When a developer runs a function in the IDE test tab, all assertions fire against the inputs. An assertion that fails immediately surfaces the exact implication that broke, and with what values.

| Operator | Name | Meaning |
|---|---|---|
| `a -> b` | Implication | If `a` is true, `b` must be true |
| `a <-> b` | Biconditional | `a` is true exactly when `b` is true |
| `a ^ b` | Exclusive or | One or the other, never both |
| `a !& b` | NAND | Not both simultaneously true — mutual exclusion |
| `a !\| b` | NOR | Neither is true — joint absence |
| `a <- b` | Converse implication | If `b` is true, `a` must be true |

> **v9 correction:** All formal logic operators are symbolic, not keyword-based.
> | v9 wrote | Correct symbol |
> |---|---|
> | `a => b` | `a -> b` |
> | `a <=> b` | `a <-> b` |
> | `a xor b` | `a ^ b` |
> | `a nand b` | `a !& b` |
> | `a nor b` | `a !| b` |
> | `a <= b` (converse) | `a <- b` |

These are particularly powerful for state machines — invariants about which states can coexist and which transitions are valid, stated inline:

```
? transitionCombat{current, incoming};
  isIdle:   current = idle
  isCombat: current = combat
  isDead:   current = dead

  isDead !& isCombat           (dead and combat are mutually exclusive)
  isIdle -> incoming = combat  (can only enter combat from idle)
  isDead -> incoming = dead    (death is terminal)

  next: isDead ? current : incoming
  ~next
```

---

### Rumus Core Primitives

| Primitive | Description |
|---|---|
| bind | Give a value a name within a function scope. Parameters are bindings. |
| apply | Pass a value to a function and receive its output. |
| compose | The output of one function becomes the input of another. |
| select | Given multiple values, produce one. The conditional shorthand expands to this. |

---

### Full Rumus Example

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
---

## Viesti — Signal Layer

Viesti is the wiring of the application. It routes data from Bija addresses through Rumus functions and writes results back to Bija. It does not compute, store, or schedule.

The decisions Viesti asks a developer to make are truth claims about the program. `~` means *this depends on that*. `~~` means *these have no dependency on each other*. Signal order is execution order. Writing signals is simultaneously writing the execution schedule.

A signal resolves when its source address has data available — pull model, not push.

---

### Sequential Signal — `~`

```
source ~ function ~ target
```

Three addresses, two tildes. Resolves completely before the next signal begins.

- **source** — named address on a Bija entity, or parameter address on a function entity
- **function** — a Rumus function entity
- **target** — named address on a Bija entity, or parameter address on a function entity

A function cannot execute until all of its parameter addresses have been populated. If only some parameters are available, the signal does not fire — no partial execution, no error.

---

### Parallel Signal — `~~`

```
source ~~ function ~ target
    indented1 ~ function2 ~ target2
    indented2 ~ function3 ~ target3
```

`~~` opens a parallel thread pool at the current depth. Indented signals under a `~~` are dispatched simultaneously to available threads. The main thread waits for all pools at the current depth to fully resolve before the next `~` signal. **The barrier is implicit — defined by indentation, not by any keyword.**

Nesting works recursively. A `~~` inside a pool follows the same rules within that pool's scope. The tree resolves leaves-first.

---

### Inline Parallel Chains

```
(inline — equivalent to indented form)
A ~~ B ~~ C

(equivalent indented form)
A ~~
    B
    C

(mixed — two parallel pools separated by a sequential step)
A ~~ B ~~ C ~ D ~ E ~~ F
```

A `~` anywhere in an inline chain is a barrier. Everything before it must resolve before it fires.

> **Race condition warning:** In `A ~~ B ~~ C`, B is simultaneously being written to and read from with no ordering guarantee. Only use `~~` chaining when no address appears on both sides of adjacent `~~` operators.

---

### Dormant Signals

```
Player.health ~ checkCritical ~
```

A signal with no target is dormant. Absent from the execution graph entirely — a compile-time known absence, not a runtime invalid state. Visible in the IDE as an unwired edge.

---

### Addressing Function Outputs

`~` output values are addressed directly by name — they are the only addressable surface a function entity exposes:

```
(single output)
Player.health ~ clamp ~ Player.health

(two separate explicit signals for two separate functions)
Range.raw ~ getFloor   ~ Range.floor
Range.raw ~ getCeiling ~ Range.ceiling
```

Everything in Viesti is explicit. Two results require two distinct functions and two distinct signals.

---

### Iteration via Signal Cycles

```
WorkQueue.current ~ processItem ~ WorkQueue.result
WorkQueue.result  ~ checkDone   ~ WorkQueue.isDone
WorkQueue.isDone  ~ onFalse     ~ WorkQueue.current
WorkQueue.isDone  ~ onTrue      ~ Output.final
```

Explicit feedback cycles. The cycle is fully visible. The runtime sees it. The author declared it.

---

### Conditional Routing

Viesti has no conditional syntax. Branching is the result of a Rumus function writing to distinct Bija addresses. Separate signals wire from each. Viesti routes from whichever address receives data. The decision was made in Rumus.

---

### Full Viesti Example

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
---

## Compilation-Pass Libraries

These libraries are not DSLs. They use Bija syntax for their declarations and run during the compiler's library pass stage, operating on the full expanded application state. They return the failing path if a claim cannot be verified.

### @Ehto

Validation constraints on Bija entities. Provides Ehto-style assertion checking during the compilation pass. Inlined validation in Rumus function bodies (formal logic assertions) is the lightweight alternative — `@Ehto` is for constraints that span multiple entities or require a dedicated pass.

### @Primi

Primitive type constraints and structural rules for the Bija layer. Runs during the library pass alongside `@Ehto`.

### @Peril

Parallelism verification. For each `~~` pool in `@Viesti`, Peril runs the pool's signals in both possible orderings and compares outputs. Matching outputs prove independence. Differing outputs mean a dependency exists that was not declared — compilation halts.

`@Peril` is optional. Including it means every `~~` is compiler-verified rather than author-asserted.

**The determinism diagnostic:** if a program produces different outputs on two runs with identical input, there is exactly one cause — a `~~` where an address is being written and read without ordering. There is no other mechanism in the language that can produce non-determinism.

---
---

## Quick-Reference Card

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
| `+  -  *  /  %` | Arithmetic |
| `-x` | Unary negation |
| `=  !=  <  >  <=  >=` | Comparison (`=` is equality, not assignment) |
| `&  \|  !` | Boolean AND / OR / NOT |
| `a ? b : c` | Conditional |
| `a -> b` | Implication |
| `a <-> b` | Biconditional |
| `a ^ b` | Exclusive or |
| `a !& b` | NAND |
| `a !\| b` | NOR |
| `a <- b` | Converse implication |

### Viesti Symbols

| Token | Meaning |
|---|---|
| `A ~ B ~ C` | Sequential signal chain |
| `A ~~ B` | Parallel signal (concurrent with peer `~~` signals) |
| `A ~ B ~` | Dormant signal (no target) |
