---
name: formal-methods
description: "Verify proofs, check theorem correctness, and solve satisfiability problems using Lean 4, Coq, and Z3 SMT solver. Use when the user asks to prove theorems, verify mathematical proofs, check logical satisfiability, or work with proof assistants."
_source: Canonical source at /skills/formal-methods/SKILL.md
---

# formal-methods

Formal verification tools for the academic workspace. Type-check Lean 4 proofs, verify Coq theories, and solve SMT satisfiability problems with Z3.

## Process

1. **Check availability** — Use `prover_status` to see which provers are installed
2. **Write proof** — Draft your Lean/Coq code or SMT formula
3. **Verify** — Use `lean_check`, `coq_check`, or `z3_solve` to verify
4. **Iterate** — Fix errors based on output and re-check

## Tools

- `lean_check` — Type-check Lean 4 code. Params: `code` (required), `filename`
- `coq_check` — Check a Coq proof. Params: `code` (required), `filename`
- `coq_compile` — Compile Coq to `.vo` object file. Params: `code` (required), `filename`
- `z3_solve` — Solve SMT-LIB2 formula. Params: `formula` (required)
- `prover_status` — Check available provers and versions. No params.

**Example:**
```json
{ "code": "theorem add_comm (a b : Nat) : a + b = b + a := Nat.add_comm a b" }
```

See [canonical skill](/skills/formal-methods/SKILL.md) for full tool documentation and parameter details.
