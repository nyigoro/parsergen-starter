import { io, str, math, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";
function lex(input) {
  const acc = { $tag: "Nil" };
  const __match_val_0 = lex_tokens(input, 0, acc);
  switch (__match_val_0.$tag) {
    case "Ok": {
      const tokens = __match_val_0.$payload;
      return { $tag: "Ok", $payload: list_reverse_tokens(tokens) };
      break;
    }
    case "Err": {
      const e = __match_val_0.$payload;
      return { $tag: "Err", $payload: e };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function lex_tokens(input, pos, acc) {
  const next_pos = skip_whitespace(input, pos);
  const len = str.length(input);
  if ((next_pos >= len)) {
    return { $tag: "Ok", $payload: { $tag: "Cons", $payload: [{ $tag: "Eof" }, acc] } };
  }
  const __match_val_1 = str.char_at(input, next_pos);
  switch (__match_val_1.$tag) {
    case "Some": {
      const c = __match_val_1.$payload;
      if (str.eq(c, "{")) {
        return lex_tokens(input, (next_pos + 1), { $tag: "Cons", $payload: [{ $tag: "LeftBrace" }, acc] });
      }
      if (str.eq(c, "}")) {
        return lex_tokens(input, (next_pos + 1), { $tag: "Cons", $payload: [{ $tag: "RightBrace" }, acc] });
      }
      if (str.eq(c, "[")) {
        return lex_tokens(input, (next_pos + 1), { $tag: "Cons", $payload: [{ $tag: "LeftBracket" }, acc] });
      }
      if (str.eq(c, "]")) {
        return lex_tokens(input, (next_pos + 1), { $tag: "Cons", $payload: [{ $tag: "RightBracket" }, acc] });
      }
      if (str.eq(c, ":")) {
        return lex_tokens(input, (next_pos + 1), { $tag: "Cons", $payload: [{ $tag: "Colon" }, acc] });
      }
      if (str.eq(c, ",")) {
        return lex_tokens(input, (next_pos + 1), { $tag: "Cons", $payload: [{ $tag: "Comma" }, acc] });
      }
      if (str.eq(c, "\"")) {
        const __match_val_2 = lex_string(input, (next_pos + 1), "");
        switch (__match_val_2.$tag) {
          case "Ok": {
            const res = __match_val_2.$payload;
            return lex_tokens(input, res.pos, { $tag: "Cons", $payload: [res.token, acc] });
            break;
          }
          case "Err": {
            const e = __match_val_2.$payload;
            return { $tag: "Err", $payload: e };
            break;
          }
          default: {
            throw new Error("Exhaustiveness failure");
          }
        }
      }
      if ((str.is_digit(c) || str.eq(c, "-"))) {
        const __match_val_3 = lex_number(input, next_pos, "");
        switch (__match_val_3.$tag) {
          case "Ok": {
            const res = __match_val_3.$payload;
            return lex_tokens(input, res.pos, { $tag: "Cons", $payload: [res.token, acc] });
            break;
          }
          case "Err": {
            const e = __match_val_3.$payload;
            return { $tag: "Err", $payload: e };
            break;
          }
          default: {
            throw new Error("Exhaustiveness failure");
          }
        }
      }
      if ((match_literal(input, next_pos, "true") && is_delimiter(input, (next_pos + 4)))) {
        return lex_tokens(input, (next_pos + 4), { $tag: "Cons", $payload: [{ $tag: "TrueLit" }, acc] });
      }
      if ((match_literal(input, next_pos, "false") && is_delimiter(input, (next_pos + 5)))) {
        return lex_tokens(input, (next_pos + 5), { $tag: "Cons", $payload: [{ $tag: "FalseLit" }, acc] });
      }
      if ((match_literal(input, next_pos, "null") && is_delimiter(input, (next_pos + 4)))) {
        return lex_tokens(input, (next_pos + 4), { $tag: "Cons", $payload: [{ $tag: "NullLit" }, acc] });
      }
      return { $tag: "Err", $payload: { $tag: "UnexpectedChar", $payload: [c, next_pos] } };
      break;
    }
    case "None": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function skip_whitespace(input, pos) {
  const __match_val_4 = str.char_at(input, pos);
  switch (__match_val_4.$tag) {
    case "Some": {
      const c = __match_val_4.$payload;
      if (str.is_whitespace(c)) {
        return skip_whitespace(input, (pos + 1));
      }
      return pos;
      break;
    }
    case "None": {
      return pos;
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function match_literal(input, pos, literal) {
  return match_literal_at(input, pos, literal, 0);
}
function match_literal_at(input, pos, literal, idx) {
  const __match_val_5 = str.char_at(literal, idx);
  switch (__match_val_5.$tag) {
    case "None": {
      return true;
      break;
    }
    case "Some": {
      const ch = __match_val_5.$payload;
      const __match_val_6 = str.char_at(input, (pos + idx));
      switch (__match_val_6.$tag) {
        case "Some": {
          const c = __match_val_6.$payload;
          if (str.eq(c, ch)) {
            return match_literal_at(input, pos, literal, (idx + 1));
          }
          return false;
          break;
        }
        case "None": {
          return false;
          break;
        }
        default: {
          throw new Error("Exhaustiveness failure");
        }
      }
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function is_delimiter(input, pos) {
  const __match_val_7 = str.char_at(input, pos);
  switch (__match_val_7.$tag) {
    case "None": {
      return true;
      break;
    }
    case "Some": {
      const c = __match_val_7.$payload;
      if (str.is_whitespace(c)) {
        return true;
      }
      if (str.eq(c, ",")) {
        return true;
      }
      if (str.eq(c, "]")) {
        return true;
      }
      if (str.eq(c, "}")) {
        return true;
      }
      if (str.eq(c, ":")) {
        return true;
      }
      return false;
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function escape_char(c) {
  if (str.eq(c, "\"")) {
    return { $tag: "Some", $payload: "\"" };
  }
  if (str.eq(c, "\\")) {
    return { $tag: "Some", $payload: "\\" };
  }
  if (str.eq(c, "/")) {
    return { $tag: "Some", $payload: "/" };
  }
  if (str.eq(c, "b")) {
    return { $tag: "Some", $payload: "\u0000008" };
  }
  if (str.eq(c, "f")) {
    return { $tag: "Some", $payload: "\u000000C" };
  }
  if (str.eq(c, "n")) {
    return { $tag: "Some", $payload: "\u000000A" };
  }
  if (str.eq(c, "r")) {
    return { $tag: "Some", $payload: "\u000000D" };
  }
  if (str.eq(c, "t")) {
    return { $tag: "Some", $payload: "\u0000009" };
  }
  return { $tag: "None" };
}
function lex_string(input, pos, acc) {
  const __match_val_8 = str.char_at(input, pos);
  switch (__match_val_8.$tag) {
    case "None": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Some": {
      const c = __match_val_8.$payload;
      if (str.eq(c, "\"")) {
        return { $tag: "Ok", $payload: { token: { $tag: "StringLit", $payload: acc }, pos: (pos + 1) } };
      }
      if (str.eq(c, "\\")) {
        const __match_val_9 = str.char_at(input, (pos + 1));
        switch (__match_val_9.$tag) {
          case "None": {
            return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
            break;
          }
          case "Some": {
            const esc = __match_val_9.$payload;
            const __match_val_10 = escape_char(esc);
            switch (__match_val_10.$tag) {
              case "Some": {
                const decoded = __match_val_10.$payload;
                return lex_string(input, (pos + 2), str.concat(acc, decoded));
                break;
              }
              case "None": {
                return { $tag: "Err", $payload: { $tag: "InvalidString", $payload: acc } };
                break;
              }
              default: {
                throw new Error("Exhaustiveness failure");
              }
            }
            break;
          }
          default: {
            throw new Error("Exhaustiveness failure");
          }
        }
      }
      return lex_string(input, (pos + 1), str.concat(acc, c));
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function take_digits(input, pos, acc, found) {
  const __match_val_11 = str.char_at(input, pos);
  switch (__match_val_11.$tag) {
    case "Some": {
      const c = __match_val_11.$payload;
      if (str.is_digit(c)) {
        return take_digits(input, (pos + 1), str.concat(acc, c), true);
      }
      return { text: acc, pos: pos, found: found };
      break;
    }
    case "None": {
      return { text: acc, pos: pos, found: found };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function lex_number(input, pos, acc) {
  let scan_pos = pos;
  let text = acc;
  const __match_val_12 = str.char_at(input, scan_pos);
  switch (__match_val_12.$tag) {
    case "Some": {
      const c = __match_val_12.$payload;
      if (str.eq(c, "-")) {
        text = str.concat(text, "-");
        scan_pos = (scan_pos + 1);
      }
      break;
    }
    case "None": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
  let scan = take_digits(input, scan_pos, text, false);
  if ((scan.found == false)) {
    return { $tag: "Err", $payload: { $tag: "InvalidNumber", $payload: scan.text } };
  }
  scan_pos = scan.pos;
  text = scan.text;
  const __match_val_13 = str.char_at(input, scan_pos);
  switch (__match_val_13.$tag) {
    case "Some": {
      const c = __match_val_13.$payload;
      if (str.eq(c, ".")) {
        scan = take_digits(input, (scan_pos + 1), str.concat(text, "."), false);
        if ((scan.found == false)) {
          return { $tag: "Err", $payload: { $tag: "InvalidNumber", $payload: scan.text } };
        }
        scan_pos = scan.pos;
        text = scan.text;
      }
      break;
    }
    case "None": {
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
  const __match_val_14 = str.char_at(input, scan_pos);
  switch (__match_val_14.$tag) {
    case "Some": {
      const c = __match_val_14.$payload;
      if ((str.eq(c, "e") || str.eq(c, "E"))) {
        text = str.concat(text, c);
        scan_pos = (scan_pos + 1);
        const __match_val_15 = str.char_at(input, scan_pos);
        switch (__match_val_15.$tag) {
          case "Some": {
            const sign = __match_val_15.$payload;
            if ((str.eq(sign, "+") || str.eq(sign, "-"))) {
              text = str.concat(text, sign);
              scan_pos = (scan_pos + 1);
            }
            break;
          }
          case "None": {
            break;
          }
          default: {
            throw new Error("Exhaustiveness failure");
          }
        }
        scan = take_digits(input, scan_pos, text, false);
        if ((scan.found == false)) {
          return { $tag: "Err", $payload: { $tag: "InvalidNumber", $payload: scan.text } };
        }
        scan_pos = scan.pos;
        text = scan.text;
      }
      break;
    }
    case "None": {
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
  const __match_val_16 = str.to_float(text);
  switch (__match_val_16.$tag) {
    case "Ok": {
      const n = __match_val_16.$payload;
      return { $tag: "Ok", $payload: { token: { $tag: "NumberLit", $payload: n }, pos: scan_pos } };
      break;
    }
    case "Err": {
      return { $tag: "Err", $payload: { $tag: "InvalidNumber", $payload: text } };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function list_nil_tokens() {
  return { $tag: "Nil" };
}
function list_reverse_tokens(list) {
  return list_reverse_tokens_into(list, list_nil_tokens());
}
function list_reverse_tokens_into(list, acc) {
  const __match_val_17 = list;
  switch (__match_val_17.$tag) {
    case "Nil": {
      return acc;
      break;
    }
    case "Cons": {
      const head = __match_val_17.$payload[0];
      const tail = __match_val_17.$payload[1];
      return list_reverse_tokens_into(tail, { $tag: "Cons", $payload: [head, acc] });
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function parse(input) {
  const __match_val_18 = lex(input);
  switch (__match_val_18.$tag) {
    case "Ok": {
      const tokens = __match_val_18.$payload;
      const __match_val_19 = parse_value(tokens);
      switch (__match_val_19.$tag) {
        case "Ok": {
          const res = __match_val_19.$payload;
          const __match_val_20 = res.rest;
          switch (__match_val_20.$tag) {
            case "Cons": {
              const tok = __match_val_20.$payload[0];
              if (token_eq(tok, { $tag: "Eof" })) {
                return { $tag: "Ok", $payload: res.value };
              }
              return { $tag: "Err", $payload: { $tag: "UnexpectedToken", $payload: [token_name(tok), 0] } };
              break;
            }
            case "Nil": {
              return { $tag: "Ok", $payload: res.value };
              break;
            }
            default: {
              throw new Error("Exhaustiveness failure");
            }
          }
          break;
        }
        case "Err": {
          const e = __match_val_19.$payload;
          return { $tag: "Err", $payload: e };
          break;
        }
        default: {
          throw new Error("Exhaustiveness failure");
        }
      }
      break;
    }
    case "Err": {
      const e = __match_val_18.$payload;
      return { $tag: "Err", $payload: e };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function parse_value(tokens) {
  const __match_val_21 = tokens;
  switch (__match_val_21.$tag) {
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Cons": {
      const tok = __match_val_21.$payload[0];
      const rest = __match_val_21.$payload[1];
      const __match_val_22 = tok;
      switch (__match_val_22.$tag) {
        case "NullLit": {
          return { $tag: "Ok", $payload: { value: { $tag: "Null" }, rest: rest } };
          break;
        }
        case "TrueLit": {
          return { $tag: "Ok", $payload: { value: { $tag: "Bool", $payload: true }, rest: rest } };
          break;
        }
        case "FalseLit": {
          return { $tag: "Ok", $payload: { value: { $tag: "Bool", $payload: false }, rest: rest } };
          break;
        }
        case "NumberLit": {
          const n = __match_val_22.$payload;
          return { $tag: "Ok", $payload: { value: { $tag: "Number", $payload: n }, rest: rest } };
          break;
        }
        case "StringLit": {
          const s = __match_val_22.$payload;
          return { $tag: "Ok", $payload: { value: { $tag: "String", $payload: s }, rest: rest } };
          break;
        }
        case "LeftBrace": {
          return parse_object(rest);
          break;
        }
        case "LeftBracket": {
          return parse_array(rest);
          break;
        }
        default: {
          return { $tag: "Err", $payload: { $tag: "UnexpectedToken", $payload: [token_name(tok), 0] } };
          break;
        }
      }
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function parse_object(tokens) {
  const __match_val_23 = tokens;
  switch (__match_val_23.$tag) {
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Cons": {
      const tok = __match_val_23.$payload[0];
      if (token_eq(tok, { $tag: "RightBrace" })) {
        return { $tag: "Ok", $payload: { value: { $tag: "Object", $payload: { $tag: "Nil" } }, rest: tokens } };
      }
      const __match_val_24 = parse_members(tokens, { $tag: "Nil" });
      switch (__match_val_24.$tag) {
        case "Ok": {
          const members_res = __match_val_24.$payload;
          const __match_val_25 = expect_token(members_res.rest, { $tag: "RightBrace" });
          switch (__match_val_25.$tag) {
            case "Ok": {
              const rest = __match_val_25.$payload;
              return { $tag: "Ok", $payload: { value: { $tag: "Object", $payload: list_reverse_entries(members_res.members) }, rest: rest } };
              break;
            }
            case "Err": {
              const e = __match_val_25.$payload;
              return { $tag: "Err", $payload: e };
              break;
            }
            default: {
              throw new Error("Exhaustiveness failure");
            }
          }
          break;
        }
        case "Err": {
          const e = __match_val_24.$payload;
          return { $tag: "Err", $payload: e };
          break;
        }
        default: {
          throw new Error("Exhaustiveness failure");
        }
      }
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function parse_members(tokens, acc) {
  const __match_val_26 = tokens;
  switch (__match_val_26.$tag) {
    case "Cons": {
      const tok = __match_val_26.$payload[0];
      const rest1 = __match_val_26.$payload[1];
      const __match_val_27 = tok;
      switch (__match_val_27.$tag) {
        case "StringLit": {
          const key = __match_val_27.$payload;
          const __match_val_28 = expect_token(rest1, { $tag: "Colon" });
          switch (__match_val_28.$tag) {
            case "Ok": {
              const rest2 = __match_val_28.$payload;
              const __match_val_29 = parse_value(rest2);
              switch (__match_val_29.$tag) {
                case "Ok": {
                  const val_res = __match_val_29.$payload;
                  const entry = { key: key, value: val_res.value };
                  const __match_val_30 = val_res.rest;
                  switch (__match_val_30.$tag) {
                    case "Cons": {
                      const next = __match_val_30.$payload[0];
                      const rest3 = __match_val_30.$payload[1];
                      if (token_eq(next, { $tag: "Comma" })) {
                        return parse_members(rest3, { $tag: "Cons", $payload: [entry, acc] });
                      }
                      return { $tag: "Ok", $payload: { members: { $tag: "Cons", $payload: [entry, acc] }, rest: val_res.rest } };
                      break;
                    }
                    case "Nil": {
                      return { $tag: "Ok", $payload: { members: { $tag: "Cons", $payload: [entry, acc] }, rest: val_res.rest } };
                      break;
                    }
                    default: {
                      throw new Error("Exhaustiveness failure");
                    }
                  }
                  break;
                }
                case "Err": {
                  const e = __match_val_29.$payload;
                  return { $tag: "Err", $payload: e };
                  break;
                }
                default: {
                  throw new Error("Exhaustiveness failure");
                }
              }
              break;
            }
            case "Err": {
              const e = __match_val_28.$payload;
              return { $tag: "Err", $payload: e };
              break;
            }
            default: {
              throw new Error("Exhaustiveness failure");
            }
          }
          break;
        }
        default: {
          return { $tag: "Err", $payload: { $tag: "UnexpectedToken", $payload: [token_name(tok), 0] } };
          break;
        }
      }
      break;
    }
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function parse_array(tokens) {
  const __match_val_31 = tokens;
  switch (__match_val_31.$tag) {
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Cons": {
      const tok = __match_val_31.$payload[0];
      if (token_eq(tok, { $tag: "RightBracket" })) {
        return { $tag: "Ok", $payload: { value: { $tag: "Array", $payload: { $tag: "Nil" } }, rest: tokens } };
      }
      const __match_val_32 = parse_elements(tokens, { $tag: "Nil" });
      switch (__match_val_32.$tag) {
        case "Ok": {
          const elems_res = __match_val_32.$payload;
          const __match_val_33 = expect_token(elems_res.rest, { $tag: "RightBracket" });
          switch (__match_val_33.$tag) {
            case "Ok": {
              const rest = __match_val_33.$payload;
              return { $tag: "Ok", $payload: { value: { $tag: "Array", $payload: list_reverse_values(elems_res.elements) }, rest: rest } };
              break;
            }
            case "Err": {
              const e = __match_val_33.$payload;
              return { $tag: "Err", $payload: e };
              break;
            }
            default: {
              throw new Error("Exhaustiveness failure");
            }
          }
          break;
        }
        case "Err": {
          const e = __match_val_32.$payload;
          return { $tag: "Err", $payload: e };
          break;
        }
        default: {
          throw new Error("Exhaustiveness failure");
        }
      }
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function parse_elements(tokens, acc) {
  const __match_val_34 = parse_value(tokens);
  switch (__match_val_34.$tag) {
    case "Ok": {
      const val_res = __match_val_34.$payload;
      const __match_val_35 = val_res.rest;
      switch (__match_val_35.$tag) {
        case "Cons": {
          const tok = __match_val_35.$payload[0];
          const rest = __match_val_35.$payload[1];
          if (token_eq(tok, { $tag: "Comma" })) {
            return parse_elements(rest, { $tag: "Cons", $payload: [val_res.value, acc] });
          }
          return { $tag: "Ok", $payload: { elements: { $tag: "Cons", $payload: [val_res.value, acc] }, rest: val_res.rest } };
          break;
        }
        case "Nil": {
          return { $tag: "Ok", $payload: { elements: { $tag: "Cons", $payload: [val_res.value, acc] }, rest: val_res.rest } };
          break;
        }
        default: {
          throw new Error("Exhaustiveness failure");
        }
      }
      break;
    }
    case "Err": {
      const e = __match_val_34.$payload;
      return { $tag: "Err", $payload: e };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function expect_token(tokens, expected) {
  const __match_val_36 = tokens;
  switch (__match_val_36.$tag) {
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Cons": {
      const tok = __match_val_36.$payload[0];
      const rest = __match_val_36.$payload[1];
      if (token_eq(tok, expected)) {
        return { $tag: "Ok", $payload: rest };
      }
      return { $tag: "Err", $payload: { $tag: "UnexpectedToken", $payload: [token_name(tok), 0] } };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function token_eq(a, b) {
  const __match_val_37 = a;
  switch (__match_val_37.$tag) {
    case "LeftBrace": {
      const __match_val_38 = b;
      switch (__match_val_38.$tag) {
        case "LeftBrace": {
          return true;
          break;
        }
        default: {
          return false;
          break;
        }
      }
      break;
    }
    case "RightBrace": {
      const __match_val_39 = b;
      switch (__match_val_39.$tag) {
        case "RightBrace": {
          return true;
          break;
        }
        default: {
          return false;
          break;
        }
      }
      break;
    }
    case "LeftBracket": {
      const __match_val_40 = b;
      switch (__match_val_40.$tag) {
        case "LeftBracket": {
          return true;
          break;
        }
        default: {
          return false;
          break;
        }
      }
      break;
    }
    case "RightBracket": {
      const __match_val_41 = b;
      switch (__match_val_41.$tag) {
        case "RightBracket": {
          return true;
          break;
        }
        default: {
          return false;
          break;
        }
      }
      break;
    }
    case "Colon": {
      const __match_val_42 = b;
      switch (__match_val_42.$tag) {
        case "Colon": {
          return true;
          break;
        }
        default: {
          return false;
          break;
        }
      }
      break;
    }
    case "Comma": {
      const __match_val_43 = b;
      switch (__match_val_43.$tag) {
        case "Comma": {
          return true;
          break;
        }
        default: {
          return false;
          break;
        }
      }
      break;
    }
    case "Eof": {
      const __match_val_44 = b;
      switch (__match_val_44.$tag) {
        case "Eof": {
          return true;
          break;
        }
        default: {
          return false;
          break;
        }
      }
      break;
    }
    default: {
      return false;
      break;
    }
  }
}
function token_name(tok) {
  const __match_val_45 = tok;
  switch (__match_val_45.$tag) {
    case "LeftBrace": {
      return "{";
      break;
    }
    case "RightBrace": {
      return "}";
      break;
    }
    case "LeftBracket": {
      return "[";
      break;
    }
    case "RightBracket": {
      return "]";
      break;
    }
    case "Colon": {
      return ":";
      break;
    }
    case "Comma": {
      return ",";
      break;
    }
    case "StringLit": {
      return "string";
      break;
    }
    case "NumberLit": {
      return "number";
      break;
    }
    case "TrueLit": {
      return "true";
      break;
    }
    case "FalseLit": {
      return "false";
      break;
    }
    case "NullLit": {
      return "null";
      break;
    }
    case "Eof": {
      return "EOF";
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function list_nil_entries() {
  return { $tag: "Nil" };
}
function list_reverse_entries(list) {
  return list_reverse_entries_into(list, list_nil_entries());
}
function list_reverse_entries_into(list, acc) {
  const __match_val_46 = list;
  switch (__match_val_46.$tag) {
    case "Nil": {
      return acc;
      break;
    }
    case "Cons": {
      const head = __match_val_46.$payload[0];
      const tail = __match_val_46.$payload[1];
      return list_reverse_entries_into(tail, { $tag: "Cons", $payload: [head, acc] });
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function list_nil_values() {
  return { $tag: "Nil" };
}
function list_reverse_values(list) {
  return list_reverse_values_into(list, list_nil_values());
}
function list_reverse_values_into(list, acc) {
  const __match_val_47 = list;
  switch (__match_val_47.$tag) {
    case "Nil": {
      return acc;
      break;
    }
    case "Cons": {
      const head = __match_val_47.$payload[0];
      const tail = __match_val_47.$payload[1];
      return list_reverse_values_into(tail, { $tag: "Cons", $payload: [head, acc] });
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function stringify(value) {
  return stringify_indent(value, 0);
}
function stringify_indent(value, indent) {
  const __match_val_48 = value;
  switch (__match_val_48.$tag) {
    case "Null": {
      return "null";
      break;
    }
    case "Bool": {
      const b = __match_val_48.$payload;
      if (b) {
        return "true";
      }
      return "false";
      break;
    }
    case "Number": {
      const n = __match_val_48.$payload;
      return str.from_float(n);
      break;
    }
    case "String": {
      const s = __match_val_48.$payload;
      return str.concat(str.concat("\"", escape_string(s)), "\"");
      break;
    }
    case "Array": {
      const elems = __match_val_48.$payload;
      return stringify_array(elems, indent);
      break;
    }
    case "Object": {
      const members = __match_val_48.$payload;
      return stringify_object(members, indent);
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function stringify_array(elems, indent) {
  const __match_val_49 = elems;
  switch (__match_val_49.$tag) {
    case "Nil": {
      return "[]";
      break;
    }
    default: {
      const inner = stringify_elements(elems, (indent + 1), true);
      return str.concat(str.concat("[\u000000A", inner), str.concat("\u000000A", str.concat(make_indent(indent), "]")));
      break;
    }
  }
}
function stringify_elements(elems, indent, first) {
  const __match_val_50 = elems;
  switch (__match_val_50.$tag) {
    case "Nil": {
      return "";
      break;
    }
    case "Cons": {
      const head = __match_val_50.$payload[0];
      const tail = __match_val_50.$payload[1];
      const prefix = prefix_for(first);
      const elem_str = str.concat(make_indent(indent), stringify_indent(head, indent));
      const __match_val_51 = tail;
      switch (__match_val_51.$tag) {
        case "Nil": {
          return str.concat(prefix, elem_str);
          break;
        }
        default: {
          return str.concat(str.concat(prefix, elem_str), stringify_elements(tail, indent, false));
          break;
        }
      }
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function stringify_object(members, indent) {
  const __match_val_52 = members;
  switch (__match_val_52.$tag) {
    case "Nil": {
      return "{}";
      break;
    }
    default: {
      const inner = stringify_members(members, (indent + 1), true);
      return str.concat(str.concat("{\u000000A", inner), str.concat("\u000000A", str.concat(make_indent(indent), "}")));
      break;
    }
  }
}
function stringify_members(members, indent, first) {
  const __match_val_53 = members;
  switch (__match_val_53.$tag) {
    case "Nil": {
      return "";
      break;
    }
    case "Cons": {
      const head = __match_val_53.$payload[0];
      const tail = __match_val_53.$payload[1];
      const prefix = prefix_for(first);
      const key_str = str.concat(str.concat("\"", escape_string(head.key)), "\"");
      const val_str = stringify_indent(head.value, indent);
      const member_str = str.concat(make_indent(indent), str.concat(key_str, str.concat(": ", val_str)));
      const __match_val_54 = tail;
      switch (__match_val_54.$tag) {
        case "Nil": {
          return str.concat(prefix, member_str);
          break;
        }
        default: {
          return str.concat(str.concat(prefix, member_str), stringify_members(tail, indent, false));
          break;
        }
      }
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function prefix_for(first) {
  if (first) {
    return "";
  }
  return ",\u000000A";
}
function make_indent(level) {
  if ((level <= 0)) {
    return "";
  }
  return str.concat("  ", make_indent((level - 1)));
}
function escape_string(s) {
  return escape_string_at(s, 0, "");
}
function escape_string_at(s, pos, acc) {
  const __match_val_55 = str.char_at(s, pos);
  switch (__match_val_55.$tag) {
    case "None": {
      return acc;
      break;
    }
    case "Some": {
      const c = __match_val_55.$payload;
      const escaped = escape_json_char(c);
      return escape_string_at(s, (pos + 1), str.concat(acc, escaped));
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function escape_json_char(c) {
  if (str.eq(c, "\"")) {
    return "\\\"";
  }
  if (str.eq(c, "\\")) {
    return "\\\\";
  }
  if (str.eq(c, "\u000000A")) {
    return "\\n";
  }
  if (str.eq(c, "\u000000D")) {
    return "\\r";
  }
  if (str.eq(c, "\u0000009")) {
    return "\\t";
  }
  return c;
}
function main() {
  io.println("Lumina JSON Parser");
  io.println("Enter JSON (or 'exit' to quit):");
  io.println("");
  repl();
}
function repl() {
  io.print("> ");
  const __match_val_56 = io.readLine();
  switch (__match_val_56.$tag) {
    case "Some": {
      const input = __match_val_56.$payload;
      if (str.eq(input, "exit")) {
        io.println("Goodbye!");
      } else {
        if (str.eq(input, "")) {
          repl();
        } else {
          process_input(input);
          repl();
        }
      }
      break;
    }
    case "None": {
      io.println("No input available");
      repl();
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function process_input(input) {
  const __match_val_57 = parse(input);
  switch (__match_val_57.$tag) {
    case "Ok": {
      const value = __match_val_57.$payload;
      io.println("Parsed successfully:");
      io.println(stringify(value));
      io.println("");
      break;
    }
    case "Err": {
      const error = __match_val_57.$payload;
      io.println("Parse error:");
      io.println(format_error(error));
      io.println("");
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
function format_error(error) {
  const __match_val_58 = error;
  switch (__match_val_58.$tag) {
    case "UnexpectedToken": {
      const tok = __match_val_58.$payload[0];
      const pos = __match_val_58.$payload[1];
      return str.concat("Unexpected token: ", str.concat(tok, str.concat(" at position ", str.from_int(pos))));
      break;
    }
    case "UnexpectedEof": {
      return "Unexpected end of input";
      break;
    }
    case "InvalidNumber": {
      const s = __match_val_58.$payload;
      return str.concat("Invalid number: ", s);
      break;
    }
    case "InvalidString": {
      const s = __match_val_58.$payload;
      return str.concat("Invalid string: ", s);
      break;
    }
    case "UnexpectedChar": {
      const c = __match_val_58.$payload[0];
      const pos = __match_val_58.$payload[1];
      return str.concat("Unexpected character: ", str.concat(c, str.concat(" at position ", str.from_int(pos))));
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }
}
main();
export { io, str, math, Result, Option, __set, formatValue, LuminaPanic };
//# sourceMappingURL=json-parser.js.map
