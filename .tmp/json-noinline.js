import { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, functor, applicative, monad, foldable, traversable, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, dom_get_element_by_id, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic } from "./lumina-runtime.js";
class Entry {
  constructor(key, value) {
    this.key = key;
    this.value = value;
  }
}
class LexResult {
  constructor(token, pos) {
    this.token = token;
    this.pos = pos;
  }
}
class DigitScan {
  constructor(text, pos, found) {
    this.text = text;
    this.pos = pos;
    this.found = found;
  }
}
function lex(input) {
  const acc = { $tag: "Nil" };
  const __match_val_0 = lex_tokens(input, 0, acc);
  const __match_tag_1 = (__match_val_0 && (__match_val_0.$tag ?? __match_val_0.tag));
  switch (__match_tag_1) {
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
  const __match_val_2 = str.char_at(input, next_pos);
  const __match_tag_3 = (__match_val_2 && (__match_val_2.$tag ?? __match_val_2.tag));
  switch (__match_tag_3) {
    case "Some": {
      const c = __match_val_2.$payload;
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
        const __match_val_4 = lex_string(input, (next_pos + 1), "");
        const __match_tag_5 = (__match_val_4 && (__match_val_4.$tag ?? __match_val_4.tag));
        switch (__match_tag_5) {
          case "Ok": {
            const res = __match_val_4.$payload;
            return lex_tokens(input, res.pos, { $tag: "Cons", $payload: [res.token, acc] });
            break;
          }
          case "Err": {
            const e = __match_val_4.$payload;
            return { $tag: "Err", $payload: e };
            break;
          }
          default: {
            throw new Error("Exhaustiveness failure");
          }
        }

      }
      if ((str.is_digit(c) || str.eq(c, "-"))) {
        const __match_val_6 = lex_number(input, next_pos, "");
        const __match_tag_7 = (__match_val_6 && (__match_val_6.$tag ?? __match_val_6.tag));
        switch (__match_tag_7) {
          case "Ok": {
            const res = __match_val_6.$payload;
            return lex_tokens(input, res.pos, { $tag: "Cons", $payload: [res.token, acc] });
            break;
          }
          case "Err": {
            const e = __match_val_6.$payload;
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
  const __match_val_8 = str.char_at(input, pos);
  const __match_tag_9 = (__match_val_8 && (__match_val_8.$tag ?? __match_val_8.tag));
  switch (__match_tag_9) {
    case "Some": {
      const c = __match_val_8.$payload;
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
  const __match_val_10 = str.char_at(literal, idx);
  const __match_tag_11 = (__match_val_10 && (__match_val_10.$tag ?? __match_val_10.tag));
  switch (__match_tag_11) {
    case "None": {
      return true;
      break;
    }
    case "Some": {
      const ch = __match_val_10.$payload;
      const __match_val_12 = str.char_at(input, (pos + idx));
      const __match_tag_13 = (__match_val_12 && (__match_val_12.$tag ?? __match_val_12.tag));
      switch (__match_tag_13) {
        case "Some": {
          const c = __match_val_12.$payload;
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
  const __match_val_14 = str.char_at(input, pos);
  const __match_tag_15 = (__match_val_14 && (__match_val_14.$tag ?? __match_val_14.tag));
  switch (__match_tag_15) {
    case "None": {
      return true;
      break;
    }
    case "Some": {
      const c = __match_val_14.$payload;
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
    return { $tag: "Some", $payload: "\b" };
  }
  if (str.eq(c, "f")) {
    return { $tag: "Some", $payload: "\f" };
  }
  if (str.eq(c, "n")) {
    return { $tag: "Some", $payload: "\n" };
  }
  if (str.eq(c, "r")) {
    return { $tag: "Some", $payload: "\r" };
  }
  if (str.eq(c, "t")) {
    return { $tag: "Some", $payload: "\t" };
  }
  return { $tag: "None" };
}
function lex_string(input, pos, acc) {
  const __match_val_16 = str.char_at(input, pos);
  const __match_tag_17 = (__match_val_16 && (__match_val_16.$tag ?? __match_val_16.tag));
  switch (__match_tag_17) {
    case "None": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Some": {
      const c = __match_val_16.$payload;
      if (str.eq(c, "\"")) {
        return { $tag: "Ok", $payload: __lumina_struct("LexResult", { token: { $tag: "StringLit", $payload: acc }, pos: (pos + 1) }) };
      }
      if (str.eq(c, "\\")) {
        const __match_val_18 = str.char_at(input, (pos + 1));
        const __match_tag_19 = (__match_val_18 && (__match_val_18.$tag ?? __match_val_18.tag));
        switch (__match_tag_19) {
          case "None": {
            return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
            break;
          }
          case "Some": {
            const esc = __match_val_18.$payload;
            const __match_val_20 = escape_char(esc);
            const __match_tag_21 = (__match_val_20 && (__match_val_20.$tag ?? __match_val_20.tag));
            switch (__match_tag_21) {
              case "Some": {
                const decoded = __match_val_20.$payload;
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
  const __match_val_22 = str.char_at(input, pos);
  const __match_tag_23 = (__match_val_22 && (__match_val_22.$tag ?? __match_val_22.tag));
  switch (__match_tag_23) {
    case "Some": {
      const c = __match_val_22.$payload;
      if (str.is_digit(c)) {
        return take_digits(input, (pos + 1), str.concat(acc, c), true);
      }
      return __lumina_struct("DigitScan", { text: acc, pos: pos, found: found });
      break;
    }
    case "None": {
      return __lumina_struct("DigitScan", { text: acc, pos: pos, found: found });
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
  const __match_val_24 = str.char_at(input, scan_pos);
  const __match_tag_25 = (__match_val_24 && (__match_val_24.$tag ?? __match_val_24.tag));
  switch (__match_tag_25) {
    case "Some": {
      const c = __match_val_24.$payload;
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
  const __match_val_26 = str.char_at(input, scan_pos);
  const __match_tag_27 = (__match_val_26 && (__match_val_26.$tag ?? __match_val_26.tag));
  switch (__match_tag_27) {
    case "Some": {
      const c = __match_val_26.$payload;
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

  const __match_val_28 = str.char_at(input, scan_pos);
  const __match_tag_29 = (__match_val_28 && (__match_val_28.$tag ?? __match_val_28.tag));
  switch (__match_tag_29) {
    case "Some": {
      const c = __match_val_28.$payload;
      if ((str.eq(c, "e") || str.eq(c, "E"))) {
        text = str.concat(text, c);
        scan_pos = (scan_pos + 1);
        const __match_val_30 = str.char_at(input, scan_pos);
        const __match_tag_31 = (__match_val_30 && (__match_val_30.$tag ?? __match_val_30.tag));
        switch (__match_tag_31) {
          case "Some": {
            const sign = __match_val_30.$payload;
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

  const __match_val_32 = str.to_float(text);
  const __match_tag_33 = (__match_val_32 && (__match_val_32.$tag ?? __match_val_32.tag));
  switch (__match_tag_33) {
    case "Ok": {
      const n = __match_val_32.$payload;
      return { $tag: "Ok", $payload: __lumina_struct("LexResult", { token: { $tag: "NumberLit", $payload: n }, pos: scan_pos }) };
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
  const __match_val_34 = list;
  const __match_tag_35 = (__match_val_34 && (__match_val_34.$tag ?? __match_val_34.tag));
  switch (__match_tag_35) {
    case "Nil": {
      return acc;
      break;
    }
    case "Cons": {
      const head = __match_val_34.$payload[0];
      const tail = __match_val_34.$payload[1];
      return list_reverse_tokens_into(tail, { $tag: "Cons", $payload: [head, acc] });
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }

}
class ParseResult {
  constructor(value, rest) {
    this.value = value;
    this.rest = rest;
  }
}
class MembersResult {
  constructor(members, rest) {
    this.members = members;
    this.rest = rest;
  }
}
class ElementsResult {
  constructor(elements, rest) {
    this.elements = elements;
    this.rest = rest;
  }
}
function parse(input) {
  const __match_val_36 = lex(input);
  const __match_tag_37 = (__match_val_36 && (__match_val_36.$tag ?? __match_val_36.tag));
  switch (__match_tag_37) {
    case "Ok": {
      const tokens = __match_val_36.$payload;
      const __match_val_38 = parse_value(tokens);
      const __match_tag_39 = (__match_val_38 && (__match_val_38.$tag ?? __match_val_38.tag));
      switch (__match_tag_39) {
        case "Ok": {
          const res = __match_val_38.$payload;
          const __match_val_40 = res.rest;
          const __match_tag_41 = (__match_val_40 && (__match_val_40.$tag ?? __match_val_40.tag));
          switch (__match_tag_41) {
            case "Cons": {
              const tok = __match_val_40.$payload[0];
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
          const e = __match_val_38.$payload;
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
      const e = __match_val_36.$payload;
      return { $tag: "Err", $payload: e };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }

}
function parse_value(tokens) {
  const __match_val_42 = tokens;
  const __match_tag_43 = (__match_val_42 && (__match_val_42.$tag ?? __match_val_42.tag));
  switch (__match_tag_43) {
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Cons": {
      const tok = __match_val_42.$payload[0];
      const rest = __match_val_42.$payload[1];
      const __match_val_44 = tok;
      const __match_tag_45 = (__match_val_44 && (__match_val_44.$tag ?? __match_val_44.tag));
      switch (__match_tag_45) {
        case "NullLit": {
          return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "Null" }, rest: rest }) };
          break;
        }
        case "TrueLit": {
          return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "Bool", $payload: true }, rest: rest }) };
          break;
        }
        case "FalseLit": {
          return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "Bool", $payload: false }, rest: rest }) };
          break;
        }
        case "NumberLit": {
          const n = __match_val_44.$payload;
          return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "Number", $payload: n }, rest: rest }) };
          break;
        }
        case "StringLit": {
          const s = __match_val_44.$payload;
          return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "String", $payload: s }, rest: rest }) };
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
  const __match_val_46 = tokens;
  const __match_tag_47 = (__match_val_46 && (__match_val_46.$tag ?? __match_val_46.tag));
  switch (__match_tag_47) {
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Cons": {
      const tok = __match_val_46.$payload[0];
      if (token_eq(tok, { $tag: "RightBrace" })) {
        return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "Object", $payload: { $tag: "Nil" } }, rest: tokens }) };
      }
      const __match_val_48 = parse_members(tokens, { $tag: "Nil" });
      const __match_tag_49 = (__match_val_48 && (__match_val_48.$tag ?? __match_val_48.tag));
      switch (__match_tag_49) {
        case "Ok": {
          const members_res = __match_val_48.$payload;
          const __match_val_50 = expect_token(members_res.rest, { $tag: "RightBrace" });
          const __match_tag_51 = (__match_val_50 && (__match_val_50.$tag ?? __match_val_50.tag));
          switch (__match_tag_51) {
            case "Ok": {
              const rest = __match_val_50.$payload;
              return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "Object", $payload: list_reverse_entries(members_res.members) }, rest: rest }) };
              break;
            }
            case "Err": {
              const e = __match_val_50.$payload;
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
          const e = __match_val_48.$payload;
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
  const __match_val_52 = tokens;
  const __match_tag_53 = (__match_val_52 && (__match_val_52.$tag ?? __match_val_52.tag));
  switch (__match_tag_53) {
    case "Cons": {
      const tok = __match_val_52.$payload[0];
      const rest1 = __match_val_52.$payload[1];
      const __match_val_54 = tok;
      const __match_tag_55 = (__match_val_54 && (__match_val_54.$tag ?? __match_val_54.tag));
      switch (__match_tag_55) {
        case "StringLit": {
          const key = __match_val_54.$payload;
          const __match_val_56 = expect_token(rest1, { $tag: "Colon" });
          const __match_tag_57 = (__match_val_56 && (__match_val_56.$tag ?? __match_val_56.tag));
          switch (__match_tag_57) {
            case "Ok": {
              const rest2 = __match_val_56.$payload;
              const __match_val_58 = parse_value(rest2);
              const __match_tag_59 = (__match_val_58 && (__match_val_58.$tag ?? __match_val_58.tag));
              switch (__match_tag_59) {
                case "Ok": {
                  const val_res = __match_val_58.$payload;
                  const entry = __lumina_struct("Entry", { key: key, value: val_res.value });
                  const __match_val_60 = val_res.rest;
                  const __match_tag_61 = (__match_val_60 && (__match_val_60.$tag ?? __match_val_60.tag));
                  switch (__match_tag_61) {
                    case "Cons": {
                      const next = __match_val_60.$payload[0];
                      const rest3 = __match_val_60.$payload[1];
                      if (token_eq(next, { $tag: "Comma" })) {
                        return parse_members(rest3, { $tag: "Cons", $payload: [entry, acc] });
                      }
                      return { $tag: "Ok", $payload: __lumina_struct("MembersResult", { members: { $tag: "Cons", $payload: [entry, acc] }, rest: val_res.rest }) };
                      break;
                    }
                    case "Nil": {
                      return { $tag: "Ok", $payload: __lumina_struct("MembersResult", { members: { $tag: "Cons", $payload: [entry, acc] }, rest: val_res.rest }) };
                      break;
                    }
                    default: {
                      throw new Error("Exhaustiveness failure");
                    }
                  }

                  break;
                }
                case "Err": {
                  const e = __match_val_58.$payload;
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
              const e = __match_val_56.$payload;
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
  const __match_val_62 = tokens;
  const __match_tag_63 = (__match_val_62 && (__match_val_62.$tag ?? __match_val_62.tag));
  switch (__match_tag_63) {
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Cons": {
      const tok = __match_val_62.$payload[0];
      if (token_eq(tok, { $tag: "RightBracket" })) {
        return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "Array", $payload: { $tag: "Nil" } }, rest: tokens }) };
      }
      const __match_val_64 = parse_elements(tokens, { $tag: "Nil" });
      const __match_tag_65 = (__match_val_64 && (__match_val_64.$tag ?? __match_val_64.tag));
      switch (__match_tag_65) {
        case "Ok": {
          const elems_res = __match_val_64.$payload;
          const __match_val_66 = expect_token(elems_res.rest, { $tag: "RightBracket" });
          const __match_tag_67 = (__match_val_66 && (__match_val_66.$tag ?? __match_val_66.tag));
          switch (__match_tag_67) {
            case "Ok": {
              const rest = __match_val_66.$payload;
              return { $tag: "Ok", $payload: __lumina_struct("ParseResult", { value: { $tag: "Array", $payload: list_reverse_values(elems_res.elements) }, rest: rest }) };
              break;
            }
            case "Err": {
              const e = __match_val_66.$payload;
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
          const e = __match_val_64.$payload;
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
  const __match_val_68 = parse_value(tokens);
  const __match_tag_69 = (__match_val_68 && (__match_val_68.$tag ?? __match_val_68.tag));
  switch (__match_tag_69) {
    case "Ok": {
      const val_res = __match_val_68.$payload;
      const __match_val_70 = val_res.rest;
      const __match_tag_71 = (__match_val_70 && (__match_val_70.$tag ?? __match_val_70.tag));
      switch (__match_tag_71) {
        case "Cons": {
          const tok = __match_val_70.$payload[0];
          const rest = __match_val_70.$payload[1];
          if (token_eq(tok, { $tag: "Comma" })) {
            return parse_elements(rest, { $tag: "Cons", $payload: [val_res.value, acc] });
          }
          return { $tag: "Ok", $payload: __lumina_struct("ElementsResult", { elements: { $tag: "Cons", $payload: [val_res.value, acc] }, rest: val_res.rest }) };
          break;
        }
        case "Nil": {
          return { $tag: "Ok", $payload: __lumina_struct("ElementsResult", { elements: { $tag: "Cons", $payload: [val_res.value, acc] }, rest: val_res.rest }) };
          break;
        }
        default: {
          throw new Error("Exhaustiveness failure");
        }
      }

      break;
    }
    case "Err": {
      const e = __match_val_68.$payload;
      return { $tag: "Err", $payload: e };
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }

}
function expect_token(tokens, expected) {
  const __match_val_72 = tokens;
  const __match_tag_73 = (__match_val_72 && (__match_val_72.$tag ?? __match_val_72.tag));
  switch (__match_tag_73) {
    case "Nil": {
      return { $tag: "Err", $payload: { $tag: "UnexpectedEof" } };
      break;
    }
    case "Cons": {
      const tok = __match_val_72.$payload[0];
      const rest = __match_val_72.$payload[1];
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
  const __match_val_74 = a;
  const __match_tag_75 = (__match_val_74 && (__match_val_74.$tag ?? __match_val_74.tag));
  switch (__match_tag_75) {
    case "LeftBrace": {
      const __match_val_76 = b;
      const __match_tag_77 = (__match_val_76 && (__match_val_76.$tag ?? __match_val_76.tag));
      switch (__match_tag_77) {
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
      const __match_val_78 = b;
      const __match_tag_79 = (__match_val_78 && (__match_val_78.$tag ?? __match_val_78.tag));
      switch (__match_tag_79) {
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
      const __match_val_80 = b;
      const __match_tag_81 = (__match_val_80 && (__match_val_80.$tag ?? __match_val_80.tag));
      switch (__match_tag_81) {
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
      const __match_val_82 = b;
      const __match_tag_83 = (__match_val_82 && (__match_val_82.$tag ?? __match_val_82.tag));
      switch (__match_tag_83) {
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
      const __match_val_84 = b;
      const __match_tag_85 = (__match_val_84 && (__match_val_84.$tag ?? __match_val_84.tag));
      switch (__match_tag_85) {
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
      const __match_val_86 = b;
      const __match_tag_87 = (__match_val_86 && (__match_val_86.$tag ?? __match_val_86.tag));
      switch (__match_tag_87) {
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
      const __match_val_88 = b;
      const __match_tag_89 = (__match_val_88 && (__match_val_88.$tag ?? __match_val_88.tag));
      switch (__match_tag_89) {
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
  const __match_val_90 = tok;
  const __match_tag_91 = (__match_val_90 && (__match_val_90.$tag ?? __match_val_90.tag));
  switch (__match_tag_91) {
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
  const __match_val_92 = list;
  const __match_tag_93 = (__match_val_92 && (__match_val_92.$tag ?? __match_val_92.tag));
  switch (__match_tag_93) {
    case "Nil": {
      return acc;
      break;
    }
    case "Cons": {
      const head = __match_val_92.$payload[0];
      const tail = __match_val_92.$payload[1];
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
  const __match_val_94 = list;
  const __match_tag_95 = (__match_val_94 && (__match_val_94.$tag ?? __match_val_94.tag));
  switch (__match_tag_95) {
    case "Nil": {
      return acc;
      break;
    }
    case "Cons": {
      const head = __match_val_94.$payload[0];
      const tail = __match_val_94.$payload[1];
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
  const __match_val_96 = value;
  const __match_tag_97 = (__match_val_96 && (__match_val_96.$tag ?? __match_val_96.tag));
  switch (__match_tag_97) {
    case "Null": {
      return "null";
      break;
    }
    case "Bool": {
      const b = __match_val_96.$payload;
      if (b) {
        return "true";
      }
      return "false";
      break;
    }
    case "Number": {
      const n = __match_val_96.$payload;
      return str.from_float(n);
      break;
    }
    case "String": {
      const s = __match_val_96.$payload;
      return str.concat(str.concat("\"", escape_string(s)), "\"");
      break;
    }
    case "Array": {
      const elems = __match_val_96.$payload;
      return stringify_array(elems, indent);
      break;
    }
    case "Object": {
      const members = __match_val_96.$payload;
      return stringify_object(members, indent);
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }

}
function stringify_array(elems, indent) {
  const __match_val_98 = elems;
  const __match_tag_99 = (__match_val_98 && (__match_val_98.$tag ?? __match_val_98.tag));
  switch (__match_tag_99) {
    case "Nil": {
      return "[]";
      break;
    }
    default: {
      const inner = stringify_elements(elems, (indent + 1), true);
      return str.concat(str.concat("[\n", inner), str.concat("\n", str.concat(make_indent(indent), "]")));
      break;
    }
  }

}
function stringify_elements(elems, indent, first) {
  const __match_val_100 = elems;
  const __match_tag_101 = (__match_val_100 && (__match_val_100.$tag ?? __match_val_100.tag));
  switch (__match_tag_101) {
    case "Nil": {
      return "";
      break;
    }
    case "Cons": {
      const head = __match_val_100.$payload[0];
      const tail = __match_val_100.$payload[1];
      const prefix = prefix_for(first);
      const elem_str = str.concat(make_indent(indent), stringify_indent(head, indent));
      const __match_val_102 = tail;
      const __match_tag_103 = (__match_val_102 && (__match_val_102.$tag ?? __match_val_102.tag));
      switch (__match_tag_103) {
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
  const __match_val_104 = members;
  const __match_tag_105 = (__match_val_104 && (__match_val_104.$tag ?? __match_val_104.tag));
  switch (__match_tag_105) {
    case "Nil": {
      return "{}";
      break;
    }
    default: {
      const inner = stringify_members(members, (indent + 1), true);
      return str.concat(str.concat("{\n", inner), str.concat("\n", str.concat(make_indent(indent), "}")));
      break;
    }
  }

}
function stringify_members(members, indent, first) {
  const __match_val_106 = members;
  const __match_tag_107 = (__match_val_106 && (__match_val_106.$tag ?? __match_val_106.tag));
  switch (__match_tag_107) {
    case "Nil": {
      return "";
      break;
    }
    case "Cons": {
      const head = __match_val_106.$payload[0];
      const tail = __match_val_106.$payload[1];
      const prefix = prefix_for(first);
      const key_str = str.concat(str.concat("\"", escape_string(head.key)), "\"");
      const val_str = stringify_indent(head.value, indent);
      const member_str = str.concat(make_indent(indent), str.concat(key_str, str.concat(": ", val_str)));
      const __match_val_108 = tail;
      const __match_tag_109 = (__match_val_108 && (__match_val_108.$tag ?? __match_val_108.tag));
      switch (__match_tag_109) {
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
  return ",\n";
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
  const __match_val_110 = str.char_at(s, pos);
  const __match_tag_111 = (__match_val_110 && (__match_val_110.$tag ?? __match_val_110.tag));
  switch (__match_tag_111) {
    case "None": {
      return acc;
      break;
    }
    case "Some": {
      const c = __match_val_110.$payload;
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
  if (str.eq(c, "\n")) {
    return "\\n";
  }
  if (str.eq(c, "\r")) {
    return "\\r";
  }
  if (str.eq(c, "\t")) {
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
  const __match_val_112 = io.readLine();
  const __match_tag_113 = (__match_val_112 && (__match_val_112.$tag ?? __match_val_112.tag));
  switch (__match_tag_113) {
    case "Some": {
      const input = __match_val_112.$payload;
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
  const __match_val_114 = parse(input);
  const __match_tag_115 = (__match_val_114 && (__match_val_114.$tag ?? __match_val_114.tag));
  switch (__match_tag_115) {
    case "Ok": {
      const value = __match_val_114.$payload;
      io.println("Parsed successfully:");
      io.println(stringify(value));
      io.println("");
      break;
    }
    case "Err": {
      const error = __match_val_114.$payload;
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
  const __match_val_116 = error;
  const __match_tag_117 = (__match_val_116 && (__match_val_116.$tag ?? __match_val_116.tag));
  switch (__match_tag_117) {
    case "UnexpectedToken": {
      const tok = __match_val_116.$payload[0];
      const pos = __match_val_116.$payload[1];
      return str.concat("Unexpected token: ", str.concat(tok, str.concat(" at position ", str.from_int(pos))));
      break;
    }
    case "UnexpectedEof": {
      return "Unexpected end of input";
      break;
    }
    case "InvalidNumber": {
      const s = __match_val_116.$payload;
      return str.concat("Invalid number: ", s);
      break;
    }
    case "InvalidString": {
      const s = __match_val_116.$payload;
      return str.concat("Invalid string: ", s);
      break;
    }
    case "UnexpectedChar": {
      const c = __match_val_116.$payload[0];
      const pos = __match_val_116.$payload[1];
      return str.concat("Unexpected character: ", str.concat(c, str.concat(" at position ", str.from_int(pos))));
      break;
    }
    default: {
      throw new Error("Exhaustiveness failure");
    }
  }

}
main();
export { io, str, math, list, vec, hashmap, hashset, deque, btreemap, btreeset, priority_queue, channel, async_channel, thread, sync, render, reactive, functor, applicative, monad, foldable, traversable, createSignal, get, set, createMemo, createEffect, vnode, text, mount_reactive, createDomRenderer, props_empty, props_class, props_on_click, props_on_click_delta, props_on_click_inc, props_on_click_dec, props_merge, dom_get_element_by_id, fs, path, env, process, json, http, time, join_all, timeout, regex, crypto, Result, Option, __set, formatValue, __lumina_stringify, __lumina_range, __lumina_slice, __lumina_index, __lumina_fixed_array, __lumina_array_bounds_check, __lumina_array_literal, __lumina_clone, __lumina_debug, __lumina_eq, __lumina_struct, __lumina_register_trait_impl, LuminaPanic };
