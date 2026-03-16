---
name: formal-methods
description: Formal verification with Lean 4, Coq, and Z3 SMT solver
---

# formal-methods

Formal verification tools for the academic workspace. Type-check Lean 4 proofs, verify Coq theories, and solve SMT satisfiability problems with Z3.

## Description

This skill wraps locally installed formal verification provers (`lean`, `coqc`, `z3`) via subprocess. No Docker or external services required.

## Usage Examples

- "Check if this Lean 4 proof type-checks"
- "Verify my Coq induction proof"
- "Is this SMT formula satisfiable?"
- "What provers are available?"

## Process

1. **Check availability** — Use `prover_status` to see which provers are installed
2. **Write proof** — Draft your Lean/Coq code or SMT formula
3. **Verify** — Use `lean_check`, `coq_check`, or `z3_solve` to verify
4. **Iterate** — Fix errors based on output and re-check

## Tools

### lean_check

Type-check Lean 4 code.

**Parameters:**
- `code` (string, required): Lean 4 source code
- `filename` (string, optional): Source filename (default: `check.lean`)

**Returns:** `{ success, output, errors, returncode }`

**Example:**
```json
{ "code": "theorem add_comm (a b : Nat) : a + b = b + a := Nat.add_comm a b" }
```

### coq_check

Check a Coq proof for correctness.

**Parameters:**
- `code` (string, required): Coq source code
- `filename` (string, optional): Source filename (default: `check.v`)

**Returns:** `{ success, compiled, output, errors, returncode }`

**Example:**
```json
{ "code": "Theorem plus_comm : forall n m : nat, n + m = m + n.\nProof. intros. lia. Qed." }
```

### coq_compile

Compile a Coq file to a `.vo` object file.

**Parameters:**
- `code` (string, required): Coq source code
- `filename` (string, optional): Source filename (default: `compile.v`)

**Returns:** `{ success, compiled, output, errors, returncode }`

### z3_solve

Solve a satisfiability problem using Z3 with SMT-LIB2 format.

**Parameters:**
- `formula` (string, required): SMT-LIB2 formula

**Returns:** `{ success, result, model }`

**Example:**
```json
{ "formula": "(declare-const x Int)\n(assert (> x 5))\n(check-sat)\n(get-model)" }
```

### prover_status

Check which formal provers are available and their versions.

**Parameters:** None

**Returns:** `{ provers: { lean4: { available, version }, coq: { available, version }, z3: { available, version } } }`

## Notes

- Requires provers installed locally (`lean`, `coqc`, `z3`)
- Z3 only accepts SMT-LIB2 format (declarative, no arbitrary code execution)
- Execution timeout is 60 seconds per invocation
