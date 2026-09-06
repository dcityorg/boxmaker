'use client';

/**
 * A tiny arithmetic evaluator for numeric fields.
 *
 * Exists because a position is often DERIVED, and the derivation is the part
 * worth keeping. Gary was writing this in a comment above the line:
 *
 *   // x = internal width - sensor x - command strip thickness
 *   // x = 76 - 25.42 - 3.7 = 36.88
 *   right,46.88,0,0,0,sen66
 *
 * -- three numbers, one result, and a comment that silently goes stale the
 * moment any of them changes. Writing `maxX - 25.42 - 3.7` instead keeps the
 * reasoning in the field, and because `maxX` is resolved from the box, it also
 * survives the box being resized. The hard-coded 76 would not have.
 *
 * Supports + - * / and parentheses, unary minus, and named variables supplied
 * by the caller. No functions, no exponent: this is for arithmetic a person
 * would otherwise do on a calculator, not a programming language.
 *
 * A bare number still evaluates to itself, so nothing that worked before
 * changes -- except that trailing rubbish is now an error where parseFloat
 * used to ignore it, which is a strictly better answer.
 */

export type Variables = Record<string, number>;

export interface EvalResult {
  value: number | null;
  error: string | null;
}

export function evaluateExpression(text: string, vars: Variables = {}): EvalResult {
  const src = text.trim();
  if (src === '') return { value: null, error: 'empty' };

  let tokens: Token[];
  try {
    tokens = tokenize(src);
  } catch (err) {
    return { value: null, error: (err as Error).message };
  }

  const p = new Parser(tokens, vars);
  try {
    const value = p.parseExpression();
    p.expectEnd();
    if (!Number.isFinite(value)) return { value: null, error: 'result is not a finite number' };
    return { value, error: null };
  } catch (err) {
    return { value: null, error: (err as Error).message };
  }
}

/* --------------------------------------------------------------- tokenizer */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' | '(' | ')' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if ('+-*/()'.includes(c)) {
      out.push({ kind: 'op', op: c as '+' });
      i++;
      continue;
    }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      const value = Number(src.slice(i, j));
      if (!Number.isFinite(value)) throw new Error(`"${src.slice(i, j)}" is not a number`);
      out.push({ kind: 'num', value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ kind: 'ident', name: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new Error(`unexpected character "${c}"`);
  }
  return out;
}

/* ------------------------------------------------------------------ parser */

class Parser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private vars: Variables
  ) {}

  /** expr := term (('+' | '-') term)* */
  parseExpression(): number {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && (t.op === '+' || t.op === '-')) {
        this.pos++;
        const right = this.parseTerm();
        left = t.op === '+' ? left + right : left - right;
      } else {
        return left;
      }
    }
  }

  /** term := factor (('*' | '/') factor)* */
  private parseTerm(): number {
    let left = this.parseFactor();
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && (t.op === '*' || t.op === '/')) {
        this.pos++;
        const right = this.parseFactor();
        if (t.op === '/' && right === 0) throw new Error('division by zero');
        left = t.op === '*' ? left * right : left / right;
      } else {
        return left;
      }
    }
  }

  /** factor := ('-' | '+')* primary */
  private parseFactor(): number {
    const t = this.peek();
    if (t?.kind === 'op' && (t.op === '-' || t.op === '+')) {
      this.pos++;
      const v = this.parseFactor();
      return t.op === '-' ? -v : v;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const t = this.peek();
    if (!t) throw new Error('expression ends early');
    if (t.kind === 'num') {
      this.pos++;
      return t.value;
    }
    if (t.kind === 'ident') {
      this.pos++;
      if (!(t.name in this.vars)) {
        const known = Object.keys(this.vars).sort().join(', ');
        throw new Error(`unknown name "${t.name}"${known ? ` (known: ${known})` : ''}`);
      }
      return this.vars[t.name];
    }
    if (t.op === '(') {
      this.pos++;
      const v = this.parseExpression();
      const close = this.peek();
      if (!(close?.kind === 'op' && close.op === ')')) throw new Error('missing ")"');
      this.pos++;
      return v;
    }
    throw new Error(`unexpected "${t.op}"`);
  }

  expectEnd(): void {
    const t = this.peek();
    if (t) throw new Error(t.kind === 'op' ? `unexpected "${t.op}"` : 'unexpected trailing input');
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
}
