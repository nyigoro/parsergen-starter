import { io, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";
function lex(input) {
  let acc = { tag: "Nil", values: [] };
  let __match0 = lex_tokens(input, 0, acc);
  if ((__match0.tag == "Ok")) {
    let tokens = __match0.values[0];
    return { tag: "Ok", values: [list_reverse_tokens(tokens)] };
  } else {
    if ((__match0.tag == "Err")) {
      let e = __match0.values[0];
      return { tag: "Err", values: [e] };
    }
  }
}
function lex_tokens(input, pos, acc) {
  let next_pos = skip_whitespace(input, pos);
  let len = length(input);
  if ((next_pos >= len)) {
    return { tag: "Ok", values: [{ tag: "Cons", values: [{ tag: "Eof", values: [] }, acc] }] };
  }
  let __match1 = char_at(input, next_pos);
  if ((__match1.tag == "Some")) {
    let c = __match1.values[0];
    if (eq(c, "{")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "LeftBrace", values: [] }, acc] });
    }
    if (eq(c, "}")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "RightBrace", values: [] }, acc] });
    }
    if (eq(c, "[")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "LeftBracket", values: [] }, acc] });
    }
    if (eq(c, "]")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "RightBracket", values: [] }, acc] });
    }
    if (eq(c, ":")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "Colon", values: [] }, acc] });
    }
    if (eq(c, ",")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "Comma", values: [] }, acc] });
    }
    if (eq(c, "\"")) {
      let __match2 = lex_string(input, (next_pos + 1), "");
      if ((__match2.tag == "Ok")) {
        let res = __match2.values[0];
        return lex_tokens(input, res.pos, { tag: "Cons", values: [res.token, acc] });
      } else {
        if ((__match2.tag == "Err")) {
          let e = __match2.values[0];
          return { tag: "Err", values: [e] };
        }
      }
    }
    if ((is_digit(c) || eq(c, "-"))) {
      let __match3 = lex_number(input, next_pos, "");
      if ((__match3.tag == "Ok")) {
        let res = __match3.values[0];
        return lex_tokens(input, res.pos, { tag: "Cons", values: [res.token, acc] });
      } else {
        if ((__match3.tag == "Err")) {
          let e = __match3.values[0];
          return { tag: "Err", values: [e] };
        }
      }
    }
    if ((match_literal(input, next_pos, "true") && is_delimiter(input, (next_pos + 4)))) {
      return lex_tokens(input, (next_pos + 4), { tag: "Cons", values: [{ tag: "TrueLit", values: [] }, acc] });
    }
    if ((match_literal(input, next_pos, "false") && is_delimiter(input, (next_pos + 5)))) {
      return lex_tokens(input, (next_pos + 5), { tag: "Cons", values: [{ tag: "FalseLit", values: [] }, acc] });
    }
    if ((match_literal(input, next_pos, "null") && is_delimiter(input, (next_pos + 4)))) {
      return lex_tokens(input, (next_pos + 4), { tag: "Cons", values: [{ tag: "NullLit", values: [] }, acc] });
    }
    return { tag: "Err", values: [{ tag: "UnexpectedChar", values: [c, next_pos] }] };
  } else {
    if ((__match1.tag == "None")) {
      return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
    }
  }
}
function skip_whitespace(input, pos) {
  let __match4 = char_at(input, pos);
  if ((__match4.tag == "Some")) {
    let c = __match4.values[0];
    if (is_whitespace(c)) {
      return skip_whitespace(input, (pos + 1));
    }
    return pos;
  } else {
    if ((__match4.tag == "None")) {
      return pos;
    }
  }
}
function match_literal(input, pos, literal) {
  return match_literal_at(input, pos, literal, 0);
}
function match_literal_at(input, pos, literal, idx) {
  let __match5 = char_at(literal, idx);
  if ((__match5.tag == "None")) {
    return true;
  } else {
    if ((__match5.tag == "Some")) {
      let ch = __match5.values[0];
      let __match6 = char_at(input, (pos + idx));
      if ((__match6.tag == "Some")) {
        let c = __match6.values[0];
        if (eq(c, ch)) {
          return match_literal_at(input, pos, literal, (idx + 1));
        }
        return false;
      } else {
        if ((__match6.tag == "None")) {
          return false;
        }
      }
    }
  }
}
function is_delimiter(input, pos) {
  let __match7 = char_at(input, pos);
  if ((__match7.tag == "None")) {
    return true;
  } else {
    if ((__match7.tag == "Some")) {
      let c = __match7.values[0];
      if (is_whitespace(c)) {
        return true;
      }
      if (eq(c, ",")) {
        return true;
      }
      if (eq(c, "]")) {
        return true;
      }
      if (eq(c, "}")) {
        return true;
      }
      if (eq(c, ":")) {
        return true;
      }
      return false;
    }
  }
}
function escape_char(c) {
  if (eq(c, "\"")) {
    return { tag: "Some", values: ["\""] };
  }
  if (eq(c, "\\")) {
    return { tag: "Some", values: ["\\"] };
  }
  if (eq(c, "/")) {
    return { tag: "Some", values: ["/"] };
  }
  if (eq(c, "b")) {
    return { tag: "Some", values: ["\u0000008"] };
  }
  if (eq(c, "f")) {
    return { tag: "Some", values: ["\u000000C"] };
  }
  if (eq(c, "n")) {
    return { tag: "Some", values: ["\u000000A"] };
  }
  if (eq(c, "r")) {
    return { tag: "Some", values: ["\u000000D"] };
  }
  if (eq(c, "t")) {
    return { tag: "Some", values: ["\u0000009"] };
  }
  return { tag: "None", values: [] };
}
function lex_string(input, pos, acc) {
  let __match8 = char_at(input, pos);
  if ((__match8.tag == "None")) {
    return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
  } else {
    if ((__match8.tag == "Some")) {
      let c = __match8.values[0];
      if (eq(c, "\"")) {
        return { tag: "Ok", values: [{ token: { tag: "StringLit", values: [acc] }, pos: (pos + 1) }] };
      }
      if (eq(c, "\\")) {
        let __match9 = char_at(input, (pos + 1));
        if ((__match9.tag == "None")) {
          return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
        } else {
          if ((__match9.tag == "Some")) {
            let esc = __match9.values[0];
            let __match10 = escape_char(esc);
            if ((__match10.tag == "Some")) {
              let decoded = __match10.values[0];
              return lex_string(input, (pos + 2), concat(acc, decoded));
            } else {
              if ((__match10.tag == "None")) {
                return { tag: "Err", values: [{ tag: "InvalidString", values: [acc] }] };
              }
            }
          }
        }
      }
      return lex_string(input, (pos + 1), concat(acc, c));
    }
  }
}
function take_digits(input, pos, acc, found) {
  let __match11 = char_at(input, pos);
  if ((__match11.tag == "Some")) {
    let c = __match11.values[0];
    if (is_digit(c)) {
      return take_digits(input, (pos + 1), concat(acc, c), true);
    }
    return { text: acc, pos: pos, found: found };
  } else {
    if ((__match11.tag == "None")) {
      return { text: acc, pos: pos, found: found };
    }
  }
}
function lex_number(input, pos, acc) {
  let scan_pos = pos;
  let text = acc;
  let __match12 = char_at(input, scan_pos);
  if ((__match12.tag == "Some")) {
    let c = __match12.values[0];
    if (eq(c, "-")) {
      text = concat(text, "-");
      scan_pos = (scan_pos + 1);
    }
  } else {
    if ((__match12.tag == "None")) {
      return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
    }
  }
  let scan = take_digits(input, scan_pos, text, false);
  if ((scan.found == false)) {
    return { tag: "Err", values: [{ tag: "InvalidNumber", values: [scan.text] }] };
  }
  scan_pos = scan.pos;
  text = scan.text;
  let __match13 = char_at(input, scan_pos);
  if ((__match13.tag == "Some")) {
    let c = __match13.values[0];
    if (eq(c, ".")) {
      scan = take_digits(input, (scan_pos + 1), concat(text, "."), false);
      if ((scan.found == false)) {
        return { tag: "Err", values: [{ tag: "InvalidNumber", values: [scan.text] }] };
      }
      scan_pos = scan.pos;
      text = scan.text;
    }
  } else {
    if ((__match13.tag == "None")) {
    }
  }
  let __match14 = char_at(input, scan_pos);
  if ((__match14.tag == "Some")) {
    let c = __match14.values[0];
    if ((eq(c, "e") || eq(c, "E"))) {
      text = concat(text, c);
      scan_pos = (scan_pos + 1);
      let __match15 = char_at(input, scan_pos);
      if ((__match15.tag == "Some")) {
        let sign = __match15.values[0];
        if ((eq(sign, "+") || eq(sign, "-"))) {
          text = concat(text, sign);
          scan_pos = (scan_pos + 1);
        }
      } else {
        if ((__match15.tag == "None")) {
        }
      }
      scan = take_digits(input, scan_pos, text, false);
      if ((scan.found == false)) {
        return { tag: "Err", values: [{ tag: "InvalidNumber", values: [scan.text] }] };
      }
      scan_pos = scan.pos;
      text = scan.text;
    }
  } else {
    if ((__match14.tag == "None")) {
    }
  }
  let __match16 = to_float(text);
  if ((__match16.tag == "Ok")) {
    let n = __match16.values[0];
    return { tag: "Ok", values: [{ token: { tag: "NumberLit", values: [n] }, pos: scan_pos }] };
  } else {
    if ((__match16.tag == "Err")) {
      return { tag: "Err", values: [{ tag: "InvalidNumber", values: [text] }] };
    }
  }
}
function list_nil_tokens() {
  return { tag: "Nil", values: [] };
}
function list_reverse_tokens(list) {
  return list_reverse_tokens_into(list, list_nil_tokens());
}
function list_reverse_tokens_into(list, acc) {
  let __match17 = list;
  if ((__match17.tag == "Nil")) {
    return acc;
  } else {
    if ((__match17.tag == "Cons")) {
      let head = __match17.values[0];
      let tail = __match17.values[1];
      return list_reverse_tokens_into(tail, { tag: "Cons", values: [head, acc] });
    }
  }
}
function parse(input) {
  let __match18 = lex(input);
  if ((__match18.tag == "Ok")) {
    let tokens = __match18.values[0];
    let __match19 = parse_value(tokens);
    if ((__match19.tag == "Ok")) {
      let res = __match19.values[0];
      let __match20 = res.rest;
      if ((__match20.tag == "Cons")) {
        let tok = __match20.values[0];
        if (token_eq(tok, { tag: "Eof", values: [] })) {
          return { tag: "Ok", values: [res.value] };
        }
        return { tag: "Err", values: [{ tag: "UnexpectedToken", values: [token_name(tok), 0] }] };
      } else {
        if ((__match20.tag == "Nil")) {
          return { tag: "Ok", values: [res.value] };
        }
      }
    } else {
      if ((__match19.tag == "Err")) {
        let e = __match19.values[0];
        return { tag: "Err", values: [e] };
      }
    }
  } else {
    if ((__match18.tag == "Err")) {
      let e = __match18.values[0];
      return { tag: "Err", values: [e] };
    }
  }
}
function parse_value(tokens) {
  let __match21 = tokens;
  if ((__match21.tag == "Nil")) {
    return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
  } else {
    if ((__match21.tag == "Cons")) {
      let tok = __match21.values[0];
      let rest = __match21.values[1];
      let __match22 = tok;
      if ((__match22.tag == "NullLit")) {
        return { tag: "Ok", values: [{ value: { tag: "Null", values: [] }, rest: rest }] };
      } else {
        if ((__match22.tag == "TrueLit")) {
          return { tag: "Ok", values: [{ value: { tag: "Bool", values: [true] }, rest: rest }] };
        } else {
          if ((__match22.tag == "FalseLit")) {
            return { tag: "Ok", values: [{ value: { tag: "Bool", values: [false] }, rest: rest }] };
          } else {
            if ((__match22.tag == "NumberLit")) {
              let n = __match22.values[0];
              return { tag: "Ok", values: [{ value: { tag: "Number", values: [n] }, rest: rest }] };
            } else {
              if ((__match22.tag == "StringLit")) {
                let s = __match22.values[0];
                return { tag: "Ok", values: [{ value: { tag: "String", values: [s] }, rest: rest }] };
              } else {
                if ((__match22.tag == "LeftBrace")) {
                  return parse_object(rest);
                } else {
                  if ((__match22.tag == "LeftBracket")) {
                    return parse_array(rest);
                  } else {
                    return { tag: "Err", values: [{ tag: "UnexpectedToken", values: [token_name(tok), 0] }] };
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function parse_object(tokens) {
  let __match23 = tokens;
  if ((__match23.tag == "Nil")) {
    return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
  } else {
    if ((__match23.tag == "Cons")) {
      let tok = __match23.values[0];
      if (token_eq(tok, { tag: "RightBrace", values: [] })) {
        return { tag: "Ok", values: [{ value: { tag: "Object", values: [{ tag: "Nil", values: [] }] }, rest: tokens }] };
      }
      let __match24 = parse_members(tokens, { tag: "Nil", values: [] });
      if ((__match24.tag == "Ok")) {
        let members_res = __match24.values[0];
        let __match25 = expect_token(members_res.rest, { tag: "RightBrace", values: [] });
        if ((__match25.tag == "Ok")) {
          let rest = __match25.values[0];
          return { tag: "Ok", values: [{ value: { tag: "Object", values: [list_reverse_entries(members_res.members)] }, rest: rest }] };
        } else {
          if ((__match25.tag == "Err")) {
            let e = __match25.values[0];
            return { tag: "Err", values: [e] };
          }
        }
      } else {
        if ((__match24.tag == "Err")) {
          let e = __match24.values[0];
          return { tag: "Err", values: [e] };
        }
      }
    }
  }
}
function parse_members(tokens, acc) {
  let __match26 = tokens;
  if ((__match26.tag == "Cons")) {
    let tok = __match26.values[0];
    let rest1 = __match26.values[1];
    let __match27 = tok;
    if ((__match27.tag == "StringLit")) {
      let key = __match27.values[0];
      let __match28 = expect_token(rest1, { tag: "Colon", values: [] });
      if ((__match28.tag == "Ok")) {
        let rest2 = __match28.values[0];
        let __match29 = parse_value(rest2);
        if ((__match29.tag == "Ok")) {
          let val_res = __match29.values[0];
          let entry = { key: key, value: val_res.value };
          let __match30 = val_res.rest;
          if ((__match30.tag == "Cons")) {
            let next = __match30.values[0];
            let rest3 = __match30.values[1];
            if (token_eq(next, { tag: "Comma", values: [] })) {
              return parse_members(rest3, { tag: "Cons", values: [entry, acc] });
            }
            return { tag: "Ok", values: [{ members: { tag: "Cons", values: [entry, acc] }, rest: val_res.rest }] };
          } else {
            if ((__match30.tag == "Nil")) {
              return { tag: "Ok", values: [{ members: { tag: "Cons", values: [entry, acc] }, rest: val_res.rest }] };
            }
          }
        } else {
          if ((__match29.tag == "Err")) {
            let e = __match29.values[0];
            return { tag: "Err", values: [e] };
          }
        }
      } else {
        if ((__match28.tag == "Err")) {
          let e = __match28.values[0];
          return { tag: "Err", values: [e] };
        }
      }
    } else {
      return { tag: "Err", values: [{ tag: "UnexpectedToken", values: [token_name(tok), 0] }] };
    }
  } else {
    if ((__match26.tag == "Nil")) {
      return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
    }
  }
}
function parse_array(tokens) {
  let __match31 = tokens;
  if ((__match31.tag == "Nil")) {
    return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
  } else {
    if ((__match31.tag == "Cons")) {
      let tok = __match31.values[0];
      if (token_eq(tok, { tag: "RightBracket", values: [] })) {
        return { tag: "Ok", values: [{ value: { tag: "Array", values: [{ tag: "Nil", values: [] }] }, rest: tokens }] };
      }
      let __match32 = parse_elements(tokens, { tag: "Nil", values: [] });
      if ((__match32.tag == "Ok")) {
        let elems_res = __match32.values[0];
        let __match33 = expect_token(elems_res.rest, { tag: "RightBracket", values: [] });
        if ((__match33.tag == "Ok")) {
          let rest = __match33.values[0];
          return { tag: "Ok", values: [{ value: { tag: "Array", values: [list_reverse_values(elems_res.elements)] }, rest: rest }] };
        } else {
          if ((__match33.tag == "Err")) {
            let e = __match33.values[0];
            return { tag: "Err", values: [e] };
          }
        }
      } else {
        if ((__match32.tag == "Err")) {
          let e = __match32.values[0];
          return { tag: "Err", values: [e] };
        }
      }
    }
  }
}
function parse_elements(tokens, acc) {
  let __match34 = parse_value(tokens);
  if ((__match34.tag == "Ok")) {
    let val_res = __match34.values[0];
    let __match35 = val_res.rest;
    if ((__match35.tag == "Cons")) {
      let tok = __match35.values[0];
      let rest = __match35.values[1];
      if (token_eq(tok, { tag: "Comma", values: [] })) {
        return parse_elements(rest, { tag: "Cons", values: [val_res.value, acc] });
      }
      return { tag: "Ok", values: [{ elements: { tag: "Cons", values: [val_res.value, acc] }, rest: val_res.rest }] };
    } else {
      if ((__match35.tag == "Nil")) {
        return { tag: "Ok", values: [{ elements: { tag: "Cons", values: [val_res.value, acc] }, rest: val_res.rest }] };
      }
    }
  } else {
    if ((__match34.tag == "Err")) {
      let e = __match34.values[0];
      return { tag: "Err", values: [e] };
    }
  }
}
function expect_token(tokens, expected) {
  let __match36 = tokens;
  if ((__match36.tag == "Nil")) {
    return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
  } else {
    if ((__match36.tag == "Cons")) {
      let tok = __match36.values[0];
      let rest = __match36.values[1];
      if (token_eq(tok, expected)) {
        return { tag: "Ok", values: [rest] };
      }
      return { tag: "Err", values: [{ tag: "UnexpectedToken", values: [token_name(tok), 0] }] };
    }
  }
}
function token_eq(a, b) {
  let __match37 = a;
  if ((__match37.tag == "LeftBrace")) {
    let __match38 = b;
    if ((__match38.tag == "LeftBrace")) {
      return true;
    } else {
      return false;
    }
  } else {
    if ((__match37.tag == "RightBrace")) {
      let __match39 = b;
      if ((__match39.tag == "RightBrace")) {
        return true;
      } else {
        return false;
      }
    } else {
      if ((__match37.tag == "LeftBracket")) {
        let __match40 = b;
        if ((__match40.tag == "LeftBracket")) {
          return true;
        } else {
          return false;
        }
      } else {
        if ((__match37.tag == "RightBracket")) {
          let __match41 = b;
          if ((__match41.tag == "RightBracket")) {
            return true;
          } else {
            return false;
          }
        } else {
          if ((__match37.tag == "Colon")) {
            let __match42 = b;
            if ((__match42.tag == "Colon")) {
              return true;
            } else {
              return false;
            }
          } else {
            if ((__match37.tag == "Comma")) {
              let __match43 = b;
              if ((__match43.tag == "Comma")) {
                return true;
              } else {
                return false;
              }
            } else {
              if ((__match37.tag == "Eof")) {
                let __match44 = b;
                if ((__match44.tag == "Eof")) {
                  return true;
                } else {
                  return false;
                }
              } else {
                return false;
              }
            }
          }
        }
      }
    }
  }
}
function token_name(tok) {
  let __match45 = tok;
  if ((__match45.tag == "LeftBrace")) {
    return "{";
  } else {
    if ((__match45.tag == "RightBrace")) {
      return "}";
    } else {
      if ((__match45.tag == "LeftBracket")) {
        return "[";
      } else {
        if ((__match45.tag == "RightBracket")) {
          return "]";
        } else {
          if ((__match45.tag == "Colon")) {
            return ":";
          } else {
            if ((__match45.tag == "Comma")) {
              return ",";
            } else {
              if ((__match45.tag == "StringLit")) {
                return "string";
              } else {
                if ((__match45.tag == "NumberLit")) {
                  return "number";
                } else {
                  if ((__match45.tag == "TrueLit")) {
                    return "true";
                  } else {
                    if ((__match45.tag == "FalseLit")) {
                      return "false";
                    } else {
                      if ((__match45.tag == "NullLit")) {
                        return "null";
                      } else {
                        if ((__match45.tag == "Eof")) {
                          return "EOF";
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function list_nil_entries() {
  return { tag: "Nil", values: [] };
}
function list_reverse_entries(list) {
  return list_reverse_entries_into(list, list_nil_entries());
}
function list_reverse_entries_into(list, acc) {
  let __match46 = list;
  if ((__match46.tag == "Nil")) {
    return acc;
  } else {
    if ((__match46.tag == "Cons")) {
      let head = __match46.values[0];
      let tail = __match46.values[1];
      return list_reverse_entries_into(tail, { tag: "Cons", values: [head, acc] });
    }
  }
}
function list_nil_values() {
  return { tag: "Nil", values: [] };
}
function list_reverse_values(list) {
  return list_reverse_values_into(list, list_nil_values());
}
function list_reverse_values_into(list, acc) {
  let __match47 = list;
  if ((__match47.tag == "Nil")) {
    return acc;
  } else {
    if ((__match47.tag == "Cons")) {
      let head = __match47.values[0];
      let tail = __match47.values[1];
      return list_reverse_values_into(tail, { tag: "Cons", values: [head, acc] });
    }
  }
}
function stringify(value) {
  return stringify_indent(value, 0);
}
function stringify_indent(value, indent) {
  let __match48 = value;
  if ((__match48.tag == "Null")) {
    return "null";
  } else {
    if ((__match48.tag == "Bool")) {
      let b = __match48.values[0];
      if (b) {
        return "true";
      }
      return "false";
    } else {
      if ((__match48.tag == "Number")) {
        let n = __match48.values[0];
        return from_float(n);
      } else {
        if ((__match48.tag == "String")) {
          let s = __match48.values[0];
          return concat(concat("\"", escape_string(s)), "\"");
        } else {
          if ((__match48.tag == "Array")) {
            let elems = __match48.values[0];
            return stringify_array(elems, indent);
          } else {
            if ((__match48.tag == "Object")) {
              let members = __match48.values[0];
              return stringify_object(members, indent);
            }
          }
        }
      }
    }
  }
}
function stringify_array(elems, indent) {
  let __match49 = elems;
  if ((__match49.tag == "Nil")) {
    return "[]";
  } else {
    let inner = stringify_elements(elems, (indent + 1), true);
    return concat(concat("[\u000000A", inner), concat("\u000000A", concat(make_indent(indent), "]")));
  }
}
function stringify_elements(elems, indent, first) {
  let __match50 = elems;
  if ((__match50.tag == "Nil")) {
    return "";
  } else {
    if ((__match50.tag == "Cons")) {
      let head = __match50.values[0];
      let tail = __match50.values[1];
      let prefix = prefix_for(first);
      let elem_str = concat(make_indent(indent), stringify_indent(head, indent));
      let __match51 = tail;
      if ((__match51.tag == "Nil")) {
        return concat(prefix, elem_str);
      } else {
        return concat(concat(prefix, elem_str), stringify_elements(tail, indent, false));
      }
    }
  }
}
function stringify_object(members, indent) {
  let __match52 = members;
  if ((__match52.tag == "Nil")) {
    return "{}";
  } else {
    let inner = stringify_members(members, (indent + 1), true);
    return concat(concat("{\u000000A", inner), concat("\u000000A", concat(make_indent(indent), "}")));
  }
}
function stringify_members(members, indent, first) {
  let __match53 = members;
  if ((__match53.tag == "Nil")) {
    return "";
  } else {
    if ((__match53.tag == "Cons")) {
      let head = __match53.values[0];
      let tail = __match53.values[1];
      let prefix = prefix_for(first);
      let key_str = concat(concat("\"", escape_string(head.key)), "\"");
      let val_str = stringify_indent(head.value, indent);
      let member_str = concat(make_indent(indent), concat(key_str, concat(": ", val_str)));
      let __match54 = tail;
      if ((__match54.tag == "Nil")) {
        return concat(prefix, member_str);
      } else {
        return concat(concat(prefix, member_str), stringify_members(tail, indent, false));
      }
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
  return concat("  ", make_indent((level - 1)));
}
function escape_string(s) {
  return escape_string_at(s, 0, "");
}
function escape_string_at(s, pos, acc) {
  let __match55 = char_at(s, pos);
  if ((__match55.tag == "None")) {
    return acc;
  } else {
    if ((__match55.tag == "Some")) {
      let c = __match55.values[0];
      let escaped = escape_json_char(c);
      return escape_string_at(s, (pos + 1), concat(acc, escaped));
    }
  }
}
function escape_json_char(c) {
  if (eq(c, "\"")) {
    return "\\\"";
  }
  if (eq(c, "\\")) {
    return "\\\\";
  }
  if (eq(c, "\u000000A")) {
    return "\\n";
  }
  if (eq(c, "\u000000D")) {
    return "\\r";
  }
  if (eq(c, "\u0000009")) {
    return "\\t";
  }
  return c;
}
function main() {
  println("Lumina JSON Parser");
  println("Enter JSON (or 'exit' to quit):");
  println("");
  repl();
}
function repl() {
  print("> ");
  let __match56 = readLine();
  if ((__match56.tag == "Some")) {
    let input = __match56.values[0];
    if (eq(input, "exit")) {
      println("Goodbye!");
    } else {
      if (eq(input, "")) {
        repl();
      } else {
        process_input(input);
        repl();
      }
    }
  } else {
    if ((__match56.tag == "None")) {
      println("No input available");
      repl();
    }
  }
}
function process_input(input) {
  let __match57 = parse(input);
  if ((__match57.tag == "Ok")) {
    let value = __match57.values[0];
    println("Parsed successfully:");
    println(stringify(value));
    println("");
  } else {
    if ((__match57.tag == "Err")) {
      let error = __match57.values[0];
      println("Parse error:");
      println(format_error(error));
      println("");
    }
  }
}
function format_error(error) {
  let __match58 = error;
  if ((__match58.tag == "UnexpectedToken")) {
    let tok = __match58.values[0];
    let pos = __match58.values[1];
    return concat("Unexpected token: ", concat(tok, concat(" at position ", from_int(pos))));
  } else {
    if ((__match58.tag == "UnexpectedEof")) {
      return "Unexpected end of input";
    } else {
      if ((__match58.tag == "InvalidNumber")) {
        let s = __match58.values[0];
        return concat("Invalid number: ", s);
      } else {
        if ((__match58.tag == "InvalidString")) {
          let s = __match58.values[0];
          return concat("Invalid string: ", s);
        } else {
          if ((__match58.tag == "UnexpectedChar")) {
            let c = __match58.values[0];
            let pos = __match58.values[1];
            return concat("Unexpected character: ", concat(c, concat(" at position ", from_int(pos))));
          }
        }
      }
    }
  }
}
main();
export { io, Result, Option, __set, formatValue, LuminaPanic };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcQWRtaW5pc3RyYXRvclxcbnlpZ29yb1xccGFyc2VyZ2VuLXN0YXJ0ZXJcXGV4YW1wbGVzXFxqc29uLXBhcnNlclxcanNvbi1wYXJzZXIubG0iXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQTRFTztBQUNELFlBQW1CO0FBQ3ZCLGlCQUFNLFdBQVcsT0FBTyxHQUFHOzs7QUFDRixXQUFPLHNCQUFVLG9CQUFvQjs7OztBQUN6QyxhQUFPLHVCQUFXOzs7QUFKL0I7QUFTUDtBQUNHLGlCQUFXLGdCQUFnQixPQUFPO0FBQ2xDLFlBQU0sT0FBVztBQUVyQixNQUFJLENBQUEsWUFBWTtBQUNkLFdBQU8sc0JBQVUsd0JBQVUsNEJBQVc7QUFHeEM7QUFBQSxpQkFBTSxRQUFZLE9BQU87OztBQUVyQixRQUFJLEdBQU8sR0FBRztBQUNaLGFBQU8sV0FBVyxPQUFPLENBQUEsV0FBVyxJQUFHLHdCQUFVLGtDQUFpQjtBQUVwRTtBQUFBLFFBQUksR0FBTyxHQUFHO0FBQ1osYUFBTyxXQUFXLE9BQU8sQ0FBQSxXQUFXLElBQUcsd0JBQVUsbUNBQWtCO0FBRXJFO0FBQUEsUUFBSSxHQUFPLEdBQUc7QUFDWixhQUFPLFdBQVcsT0FBTyxDQUFBLFdBQVcsSUFBRyx3QkFBVSxvQ0FBbUI7QUFFdEU7QUFBQSxRQUFJLEdBQU8sR0FBRztBQUNaLGFBQU8sV0FBVyxPQUFPLENBQUEsV0FBVyxJQUFHLHdCQUFVLHFDQUFvQjtBQUV2RTtBQUFBLFFBQUksR0FBTyxHQUFHO0FBQ1osYUFBTyxXQUFXLE9BQU8sQ0FBQSxXQUFXLElBQUcsd0JBQVUsOEJBQWE7QUFFaEU7QUFBQSxRQUFJLEdBQU8sR0FBRztBQUNaLGFBQU8sV0FBVyxPQUFPLENBQUEsV0FBVyxJQUFHLHdCQUFVLDhCQUFhO0FBRWhFO0FBQUEsUUFBSSxHQUFPLEdBQUc7QUFDWixxQkFBTSxXQUFXLE9BQU8sQ0FBQSxXQUFXLElBQUc7OztBQUNoQixlQUFPLFdBQVcsT0FBTyxTQUFTLHdCQUFVLFdBQVc7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QUFDRCxrQkFBTTs7OztBQUVGLFdBQU8sT0FBVyxzQkFBc0IsT0FBVyxLQUFLLE9BQVcsaUJBQWlCLFNBQWE7OztBQUVyRSxhQUFPOzs7O0FBQ0osZUFBTyxPQUFXLG9CQUFvQjs7OztBQUN0QyxpQkFBTyxPQUFXLG9CQUFvQjs7Ozs7QUFFckUsbUJBQU8sT0FBVywwQkFBMEIsT0FBVyxHQUFHLE9BQVcsaUJBQWlCLFNBQWE7Ozs7OztBQVQxRjtBQWNmIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgaW8sIHN0ciB9IGZyb20gXCJAc3RkXCJcclxuXHJcbi8vIENvcmUgZGF0YSBzdHJ1Y3R1cmVzIGZvciBKU09OIHBhcnNpbmdcclxuXHJcbi8vIFJlY3Vyc2l2ZSBsaXN0IHR5cGVcclxucHViIGVudW0gTGlzdDxUPiB7XHJcbiAgTmlsLFxyXG4gIENvbnMoVCwgTGlzdDxUPilcclxufVxyXG5cclxuLy8gU3RhbmRhcmQgb3B0aW9uIHR5cGVcclxucHViIGVudW0gT3B0aW9uPFQ+IHtcclxuICBTb21lKFQpLFxyXG4gIE5vbmVcclxufVxyXG5cclxuLy8gU3RhbmRhcmQgcmVzdWx0IHR5cGVcclxucHViIGVudW0gUmVzdWx0PFQsIEU+IHtcclxuICBPayhUKSxcclxuICBFcnIoRSlcclxufVxyXG5cclxuLy8gS2V5LXZhbHVlIHBhaXIgZm9yIEpTT04gb2JqZWN0c1xyXG5wdWIgc3RydWN0IEVudHJ5IHtcclxuICBrZXk6IHN0cmluZyxcclxuICB2YWx1ZTogSnNvblZhbHVlXHJcbn1cclxuXHJcbi8vIEpTT04gdmFsdWUgcmVwcmVzZW50YXRpb25cclxucHViIGVudW0gSnNvblZhbHVlIHtcclxuICBOdWxsLFxyXG4gIEJvb2woYm9vbCksXHJcbiAgTnVtYmVyKGZsb2F0KSxcclxuICBTdHJpbmcoc3RyaW5nKSxcclxuICBBcnJheShMaXN0PEpzb25WYWx1ZT4pLFxyXG4gIE9iamVjdChMaXN0PEVudHJ5PilcclxufVxyXG5cclxuLy8gTGV4ZXIgdG9rZW5zXHJcbnB1YiBlbnVtIFRva2VuIHtcclxuICBMZWZ0QnJhY2UsXHJcbiAgUmlnaHRCcmFjZSxcclxuICBMZWZ0QnJhY2tldCxcclxuICBSaWdodEJyYWNrZXQsXHJcbiAgQ29sb24sXHJcbiAgQ29tbWEsXHJcbiAgU3RyaW5nTGl0KHN0cmluZyksXHJcbiAgTnVtYmVyTGl0KGZsb2F0KSxcclxuICBUcnVlTGl0LFxyXG4gIEZhbHNlTGl0LFxyXG4gIE51bGxMaXQsXHJcbiAgRW9mXHJcbn1cclxuXHJcbi8vIFBhcnNlIGVycm9ycyB3aXRoIGNvbnRleHRcclxucHViIGVudW0gUGFyc2VFcnJvciB7XHJcbiAgVW5leHBlY3RlZFRva2VuKHN0cmluZywgaW50KSxcclxuICBVbmV4cGVjdGVkRW9mLFxyXG4gIEludmFsaWROdW1iZXIoc3RyaW5nKSxcclxuICBJbnZhbGlkU3RyaW5nKHN0cmluZyksXHJcbiAgVW5leHBlY3RlZENoYXIoc3RyaW5nLCBpbnQpXHJcbn1cclxuXHJcblxyXG5zdHJ1Y3QgTGV4UmVzdWx0IHtcclxuICB0b2tlbjogVG9rZW4sXHJcbiAgcG9zOiBpbnRcclxufVxyXG5cclxuc3RydWN0IERpZ2l0U2NhbiB7XHJcbiAgdGV4dDogc3RyaW5nLFxyXG4gIHBvczogaW50LFxyXG4gIGZvdW5kOiBib29sXHJcbn1cclxuXHJcbi8vIE1haW4gbGV4ZXIgZW50cnkgcG9pbnRcclxucHViIGZuIGxleChpbnB1dDogc3RyaW5nKSAtPiBSZXN1bHQ8TGlzdDxUb2tlbj4sIFBhcnNlRXJyb3I+IHtcclxuICBsZXQgYWNjOiBMaXN0PFRva2VuPiA9IExpc3QuTmlsXHJcbiAgbWF0Y2ggbGV4X3Rva2VucyhpbnB1dCwgMCwgYWNjKSB7XHJcbiAgICBSZXN1bHQuT2sodG9rZW5zKSA9PiB7IHJldHVybiBSZXN1bHQuT2sobGlzdF9yZXZlcnNlX3Rva2Vucyh0b2tlbnMpKSB9LFxyXG4gICAgUmVzdWx0LkVycihlKSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKGUpIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIFJlY3Vyc2l2ZSB0b2tlbml6YXRpb24gKGFjY3VtdWxhdGVzIGluIHJldmVyc2UpXHJcbmZuIGxleF90b2tlbnMoaW5wdXQ6IHN0cmluZywgcG9zOiBpbnQsIGFjYzogTGlzdDxUb2tlbj4pIC0+IFJlc3VsdDxMaXN0PFRva2VuPiwgUGFyc2VFcnJvcj4ge1xyXG4gIGxldCBuZXh0X3BvcyA9IHNraXBfd2hpdGVzcGFjZShpbnB1dCwgcG9zKVxyXG4gIGxldCBsZW4gPSBzdHIubGVuZ3RoKGlucHV0KVxyXG5cclxuICBpZiAobmV4dF9wb3MgPj0gbGVuKSB7XHJcbiAgICByZXR1cm4gUmVzdWx0Lk9rKExpc3QuQ29ucyhUb2tlbi5Fb2YsIGFjYykpXHJcbiAgfVxyXG5cclxuICBtYXRjaCBzdHIuY2hhcl9hdChpbnB1dCwgbmV4dF9wb3MpIHtcclxuICAgIE9wdGlvbi5Tb21lKGMpID0+IHtcclxuICAgICAgaWYgKHN0ci5lcShjLCBcIntcIikpIHtcclxuICAgICAgICByZXR1cm4gbGV4X3Rva2VucyhpbnB1dCwgbmV4dF9wb3MgKyAxLCBMaXN0LkNvbnMoVG9rZW4uTGVmdEJyYWNlLCBhY2MpKVxyXG4gICAgICB9XHJcbiAgICAgIGlmIChzdHIuZXEoYywgXCJ9XCIpKSB7XHJcbiAgICAgICAgcmV0dXJuIGxleF90b2tlbnMoaW5wdXQsIG5leHRfcG9zICsgMSwgTGlzdC5Db25zKFRva2VuLlJpZ2h0QnJhY2UsIGFjYykpXHJcbiAgICAgIH1cclxuICAgICAgaWYgKHN0ci5lcShjLCBcIltcIikpIHtcclxuICAgICAgICByZXR1cm4gbGV4X3Rva2VucyhpbnB1dCwgbmV4dF9wb3MgKyAxLCBMaXN0LkNvbnMoVG9rZW4uTGVmdEJyYWNrZXQsIGFjYykpXHJcbiAgICAgIH1cclxuICAgICAgaWYgKHN0ci5lcShjLCBcIl1cIikpIHtcclxuICAgICAgICByZXR1cm4gbGV4X3Rva2VucyhpbnB1dCwgbmV4dF9wb3MgKyAxLCBMaXN0LkNvbnMoVG9rZW4uUmlnaHRCcmFja2V0LCBhY2MpKVxyXG4gICAgICB9XHJcbiAgICAgIGlmIChzdHIuZXEoYywgXCI6XCIpKSB7XHJcbiAgICAgICAgcmV0dXJuIGxleF90b2tlbnMoaW5wdXQsIG5leHRfcG9zICsgMSwgTGlzdC5Db25zKFRva2VuLkNvbG9uLCBhY2MpKVxyXG4gICAgICB9XHJcbiAgICAgIGlmIChzdHIuZXEoYywgXCIsXCIpKSB7XHJcbiAgICAgICAgcmV0dXJuIGxleF90b2tlbnMoaW5wdXQsIG5leHRfcG9zICsgMSwgTGlzdC5Db25zKFRva2VuLkNvbW1hLCBhY2MpKVxyXG4gICAgICB9XHJcbiAgICAgIGlmIChzdHIuZXEoYywgXCJcXFwiXCIpKSB7XHJcbiAgICAgICAgbWF0Y2ggbGV4X3N0cmluZyhpbnB1dCwgbmV4dF9wb3MgKyAxLCBcIlwiKSB7XHJcbiAgICAgICAgICBSZXN1bHQuT2socmVzKSA9PiB7IHJldHVybiBsZXhfdG9rZW5zKGlucHV0LCByZXMucG9zLCBMaXN0LkNvbnMocmVzLnRva2VuLCBhY2MpKSB9LFxyXG4gICAgICAgICAgUmVzdWx0LkVycihlKSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKGUpIH1cclxuICAgICAgICB9XHJcbiAgICAgIH1cclxuICAgICAgaWYgKHN0ci5pc19kaWdpdChjKSB8fCBzdHIuZXEoYywgXCItXCIpKSB7XHJcbiAgICAgICAgbWF0Y2ggbGV4X251bWJlcihpbnB1dCwgbmV4dF9wb3MsIFwiXCIpIHtcclxuICAgICAgICAgIFJlc3VsdC5PayhyZXMpID0+IHsgcmV0dXJuIGxleF90b2tlbnMoaW5wdXQsIHJlcy5wb3MsIExpc3QuQ29ucyhyZXMudG9rZW4sIGFjYykpIH0sXHJcbiAgICAgICAgICBSZXN1bHQuRXJyKGUpID0+IHsgcmV0dXJuIFJlc3VsdC5FcnIoZSkgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgICBpZiAobWF0Y2hfbGl0ZXJhbChpbnB1dCwgbmV4dF9wb3MsIFwidHJ1ZVwiKSAmJiBpc19kZWxpbWl0ZXIoaW5wdXQsIG5leHRfcG9zICsgNCkpIHtcclxuICAgICAgICByZXR1cm4gbGV4X3Rva2VucyhpbnB1dCwgbmV4dF9wb3MgKyA0LCBMaXN0LkNvbnMoVG9rZW4uVHJ1ZUxpdCwgYWNjKSlcclxuICAgICAgfVxyXG4gICAgICBpZiAobWF0Y2hfbGl0ZXJhbChpbnB1dCwgbmV4dF9wb3MsIFwiZmFsc2VcIikgJiYgaXNfZGVsaW1pdGVyKGlucHV0LCBuZXh0X3BvcyArIDUpKSB7XHJcbiAgICAgICAgcmV0dXJuIGxleF90b2tlbnMoaW5wdXQsIG5leHRfcG9zICsgNSwgTGlzdC5Db25zKFRva2VuLkZhbHNlTGl0LCBhY2MpKVxyXG4gICAgICB9XHJcbiAgICAgIGlmIChtYXRjaF9saXRlcmFsKGlucHV0LCBuZXh0X3BvcywgXCJudWxsXCIpICYmIGlzX2RlbGltaXRlcihpbnB1dCwgbmV4dF9wb3MgKyA0KSkge1xyXG4gICAgICAgIHJldHVybiBsZXhfdG9rZW5zKGlucHV0LCBuZXh0X3BvcyArIDQsIExpc3QuQ29ucyhUb2tlbi5OdWxsTGl0LCBhY2MpKVxyXG4gICAgICB9XHJcblxyXG4gICAgICByZXR1cm4gUmVzdWx0LkVycihQYXJzZUVycm9yLlVuZXhwZWN0ZWRDaGFyKGMsIG5leHRfcG9zKSlcclxuICAgIH0sXHJcbiAgICBPcHRpb24uTm9uZSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuVW5leHBlY3RlZEVvZikgfVxyXG4gIH1cclxufVxyXG5cclxuLy8gSGVscGVyOiBza2lwIHdoaXRlc3BhY2VcclxuZm4gc2tpcF93aGl0ZXNwYWNlKGlucHV0OiBzdHJpbmcsIHBvczogaW50KSAtPiBpbnQge1xyXG4gIG1hdGNoIHN0ci5jaGFyX2F0KGlucHV0LCBwb3MpIHtcclxuICAgIE9wdGlvbi5Tb21lKGMpID0+IHtcclxuICAgICAgaWYgKHN0ci5pc193aGl0ZXNwYWNlKGMpKSB7XHJcbiAgICAgICAgcmV0dXJuIHNraXBfd2hpdGVzcGFjZShpbnB1dCwgcG9zICsgMSlcclxuICAgICAgfVxyXG4gICAgICByZXR1cm4gcG9zXHJcbiAgICB9LFxyXG4gICAgT3B0aW9uLk5vbmUgPT4geyByZXR1cm4gcG9zIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIEhlbHBlcjogbWF0Y2ggbGl0ZXJhbCBzdHJpbmcgYXQgcG9zaXRpb25cclxuZm4gbWF0Y2hfbGl0ZXJhbChpbnB1dDogc3RyaW5nLCBwb3M6IGludCwgbGl0ZXJhbDogc3RyaW5nKSAtPiBib29sIHtcclxuICByZXR1cm4gbWF0Y2hfbGl0ZXJhbF9hdChpbnB1dCwgcG9zLCBsaXRlcmFsLCAwKVxyXG59XHJcblxyXG5mbiBtYXRjaF9saXRlcmFsX2F0KGlucHV0OiBzdHJpbmcsIHBvczogaW50LCBsaXRlcmFsOiBzdHJpbmcsIGlkeDogaW50KSAtPiBib29sIHtcclxuICBtYXRjaCBzdHIuY2hhcl9hdChsaXRlcmFsLCBpZHgpIHtcclxuICAgIE9wdGlvbi5Ob25lID0+IHsgcmV0dXJuIHRydWUgfSxcclxuICAgIE9wdGlvbi5Tb21lKGNoKSA9PiB7XHJcbiAgICAgIG1hdGNoIHN0ci5jaGFyX2F0KGlucHV0LCBwb3MgKyBpZHgpIHtcclxuICAgICAgICBPcHRpb24uU29tZShjKSA9PiB7XHJcbiAgICAgICAgICBpZiAoc3RyLmVxKGMsIGNoKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hfbGl0ZXJhbF9hdChpbnB1dCwgcG9zLCBsaXRlcmFsLCBpZHggKyAxKVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgICAgcmV0dXJuIGZhbHNlXHJcbiAgICAgICAgfSxcclxuICAgICAgICBPcHRpb24uTm9uZSA9PiB7IHJldHVybiBmYWxzZSB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZuIGlzX2RlbGltaXRlcihpbnB1dDogc3RyaW5nLCBwb3M6IGludCkgLT4gYm9vbCB7XHJcbiAgbWF0Y2ggc3RyLmNoYXJfYXQoaW5wdXQsIHBvcykge1xyXG4gICAgT3B0aW9uLk5vbmUgPT4geyByZXR1cm4gdHJ1ZSB9LFxyXG4gICAgT3B0aW9uLlNvbWUoYykgPT4ge1xyXG4gICAgICBpZiAoc3RyLmlzX3doaXRlc3BhY2UoYykpIHsgcmV0dXJuIHRydWUgfVxyXG4gICAgICBpZiAoc3RyLmVxKGMsIFwiLFwiKSkgeyByZXR1cm4gdHJ1ZSB9XHJcbiAgICAgIGlmIChzdHIuZXEoYywgXCJdXCIpKSB7IHJldHVybiB0cnVlIH1cclxuICAgICAgaWYgKHN0ci5lcShjLCBcIn1cIikpIHsgcmV0dXJuIHRydWUgfVxyXG4gICAgICBpZiAoc3RyLmVxKGMsIFwiOlwiKSkgeyByZXR1cm4gdHJ1ZSB9XHJcbiAgICAgIHJldHVybiBmYWxzZVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZm4gZXNjYXBlX2NoYXIoYzogc3RyaW5nKSAtPiBPcHRpb248c3RyaW5nPiB7XHJcbiAgaWYgKHN0ci5lcShjLCBcIlxcXCJcIikpIHsgcmV0dXJuIE9wdGlvbi5Tb21lKFwiXFxcIlwiKSB9XHJcbiAgaWYgKHN0ci5lcShjLCBcIlxcXFxcIikpIHsgcmV0dXJuIE9wdGlvbi5Tb21lKFwiXFxcXFwiKSB9XHJcbiAgaWYgKHN0ci5lcShjLCBcIi9cIikpIHsgcmV0dXJuIE9wdGlvbi5Tb21lKFwiL1wiKSB9XHJcbiAgaWYgKHN0ci5lcShjLCBcImJcIikpIHsgcmV0dXJuIE9wdGlvbi5Tb21lKFwiXFx1MDAwOFwiKSB9XHJcbiAgaWYgKHN0ci5lcShjLCBcImZcIikpIHsgcmV0dXJuIE9wdGlvbi5Tb21lKFwiXFx1MDAwQ1wiKSB9XHJcbiAgaWYgKHN0ci5lcShjLCBcIm5cIikpIHsgcmV0dXJuIE9wdGlvbi5Tb21lKFwiXFx1MDAwQVwiKSB9XHJcbiAgaWYgKHN0ci5lcShjLCBcInJcIikpIHsgcmV0dXJuIE9wdGlvbi5Tb21lKFwiXFx1MDAwRFwiKSB9XHJcbiAgaWYgKHN0ci5lcShjLCBcInRcIikpIHsgcmV0dXJuIE9wdGlvbi5Tb21lKFwiXFx1MDAwOVwiKSB9XHJcbiAgcmV0dXJuIE9wdGlvbi5Ob25lXHJcbn1cclxuXHJcbi8vIExleCBzdHJpbmcgbGl0ZXJhbCAoYmFzaWMgZXNjYXBlcylcclxuZm4gbGV4X3N0cmluZyhpbnB1dDogc3RyaW5nLCBwb3M6IGludCwgYWNjOiBzdHJpbmcpIC0+IFJlc3VsdDxMZXhSZXN1bHQsIFBhcnNlRXJyb3I+IHtcclxuICBtYXRjaCBzdHIuY2hhcl9hdChpbnB1dCwgcG9zKSB7XHJcbiAgICBPcHRpb24uTm9uZSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuVW5leHBlY3RlZEVvZikgfSxcclxuICAgIE9wdGlvbi5Tb21lKGMpID0+IHtcclxuICAgICAgaWYgKHN0ci5lcShjLCBcIlxcXCJcIikpIHtcclxuICAgICAgICByZXR1cm4gUmVzdWx0Lk9rKExleFJlc3VsdCB7IHRva2VuOiBUb2tlbi5TdHJpbmdMaXQoYWNjKSwgcG9zOiBwb3MgKyAxIH0pXHJcbiAgICAgIH1cclxuICAgICAgaWYgKHN0ci5lcShjLCBcIlxcXFxcIikpIHtcclxuICAgICAgICBtYXRjaCBzdHIuY2hhcl9hdChpbnB1dCwgcG9zICsgMSkge1xyXG4gICAgICAgICAgT3B0aW9uLk5vbmUgPT4geyByZXR1cm4gUmVzdWx0LkVycihQYXJzZUVycm9yLlVuZXhwZWN0ZWRFb2YpIH0sXHJcbiAgICAgICAgICBPcHRpb24uU29tZShlc2MpID0+IHtcclxuICAgICAgICAgICAgbWF0Y2ggZXNjYXBlX2NoYXIoZXNjKSB7XHJcbiAgICAgICAgICAgICAgT3B0aW9uLlNvbWUoZGVjb2RlZCkgPT4geyByZXR1cm4gbGV4X3N0cmluZyhpbnB1dCwgcG9zICsgMiwgc3RyLmNvbmNhdChhY2MsIGRlY29kZWQpKSB9LFxyXG4gICAgICAgICAgICAgIE9wdGlvbi5Ob25lID0+IHsgcmV0dXJuIFJlc3VsdC5FcnIoUGFyc2VFcnJvci5JbnZhbGlkU3RyaW5nKGFjYykpIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG5cclxuICAgICAgcmV0dXJuIGxleF9zdHJpbmcoaW5wdXQsIHBvcyArIDEsIHN0ci5jb25jYXQoYWNjLCBjKSlcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZuIHRha2VfZGlnaXRzKGlucHV0OiBzdHJpbmcsIHBvczogaW50LCBhY2M6IHN0cmluZywgZm91bmQ6IGJvb2wpIC0+IERpZ2l0U2NhbiB7XHJcbiAgbWF0Y2ggc3RyLmNoYXJfYXQoaW5wdXQsIHBvcykge1xyXG4gICAgT3B0aW9uLlNvbWUoYykgPT4ge1xyXG4gICAgICBpZiAoc3RyLmlzX2RpZ2l0KGMpKSB7XHJcbiAgICAgICAgcmV0dXJuIHRha2VfZGlnaXRzKGlucHV0LCBwb3MgKyAxLCBzdHIuY29uY2F0KGFjYywgYyksIHRydWUpXHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIERpZ2l0U2NhbiB7IHRleHQ6IGFjYywgcG9zOiBwb3MsIGZvdW5kOiBmb3VuZCB9XHJcbiAgICB9LFxyXG4gICAgT3B0aW9uLk5vbmUgPT4geyByZXR1cm4gRGlnaXRTY2FuIHsgdGV4dDogYWNjLCBwb3M6IHBvcywgZm91bmQ6IGZvdW5kIH0gfVxyXG4gIH1cclxufVxyXG5cclxuLy8gTGV4IG51bWJlciBsaXRlcmFsXHJcbmZuIGxleF9udW1iZXIoaW5wdXQ6IHN0cmluZywgcG9zOiBpbnQsIGFjYzogc3RyaW5nKSAtPiBSZXN1bHQ8TGV4UmVzdWx0LCBQYXJzZUVycm9yPiB7XHJcbiAgbGV0IG11dCBzY2FuX3BvcyA9IHBvc1xyXG4gIGxldCBtdXQgdGV4dCA9IGFjY1xyXG5cclxuICBtYXRjaCBzdHIuY2hhcl9hdChpbnB1dCwgc2Nhbl9wb3MpIHtcclxuICAgIE9wdGlvbi5Tb21lKGMpID0+IHtcclxuICAgICAgaWYgKHN0ci5lcShjLCBcIi1cIikpIHtcclxuICAgICAgICB0ZXh0ID0gc3RyLmNvbmNhdCh0ZXh0LCBcIi1cIilcclxuICAgICAgICBzY2FuX3BvcyA9IHNjYW5fcG9zICsgMVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgT3B0aW9uLk5vbmUgPT4geyByZXR1cm4gUmVzdWx0LkVycihQYXJzZUVycm9yLlVuZXhwZWN0ZWRFb2YpIH1cclxuICB9XHJcblxyXG4gIGxldCBtdXQgc2NhbiA9IHRha2VfZGlnaXRzKGlucHV0LCBzY2FuX3BvcywgdGV4dCwgZmFsc2UpXHJcbiAgaWYgKHNjYW4uZm91bmQgPT0gZmFsc2UpIHtcclxuICAgIHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuSW52YWxpZE51bWJlcihzY2FuLnRleHQpKVxyXG4gIH1cclxuXHJcbiAgc2Nhbl9wb3MgPSBzY2FuLnBvc1xyXG4gIHRleHQgPSBzY2FuLnRleHRcclxuXHJcbiAgbWF0Y2ggc3RyLmNoYXJfYXQoaW5wdXQsIHNjYW5fcG9zKSB7XHJcbiAgICBPcHRpb24uU29tZShjKSA9PiB7XHJcbiAgICAgIGlmIChzdHIuZXEoYywgXCIuXCIpKSB7XHJcbiAgICAgICAgc2NhbiA9IHRha2VfZGlnaXRzKGlucHV0LCBzY2FuX3BvcyArIDEsIHN0ci5jb25jYXQodGV4dCwgXCIuXCIpLCBmYWxzZSlcclxuICAgICAgICBpZiAoc2Nhbi5mb3VuZCA9PSBmYWxzZSkge1xyXG4gICAgICAgICAgcmV0dXJuIFJlc3VsdC5FcnIoUGFyc2VFcnJvci5JbnZhbGlkTnVtYmVyKHNjYW4udGV4dCkpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHNjYW5fcG9zID0gc2Nhbi5wb3NcclxuICAgICAgICB0ZXh0ID0gc2Nhbi50ZXh0XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBPcHRpb24uTm9uZSA9PiB7fVxyXG4gIH1cclxuXHJcbiAgbWF0Y2ggc3RyLmNoYXJfYXQoaW5wdXQsIHNjYW5fcG9zKSB7XHJcbiAgICBPcHRpb24uU29tZShjKSA9PiB7XHJcbiAgICAgIGlmIChzdHIuZXEoYywgXCJlXCIpIHx8IHN0ci5lcShjLCBcIkVcIikpIHtcclxuICAgICAgICB0ZXh0ID0gc3RyLmNvbmNhdCh0ZXh0LCBjKVxyXG4gICAgICAgIHNjYW5fcG9zID0gc2Nhbl9wb3MgKyAxXHJcbiAgICAgICAgbWF0Y2ggc3RyLmNoYXJfYXQoaW5wdXQsIHNjYW5fcG9zKSB7XHJcbiAgICAgICAgICBPcHRpb24uU29tZShzaWduKSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChzdHIuZXEoc2lnbiwgXCIrXCIpIHx8IHN0ci5lcShzaWduLCBcIi1cIikpIHtcclxuICAgICAgICAgICAgICB0ZXh0ID0gc3RyLmNvbmNhdCh0ZXh0LCBzaWduKVxyXG4gICAgICAgICAgICAgIHNjYW5fcG9zID0gc2Nhbl9wb3MgKyAxXHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICBPcHRpb24uTm9uZSA9PiB7fVxyXG4gICAgICAgIH1cclxuICAgICAgICBzY2FuID0gdGFrZV9kaWdpdHMoaW5wdXQsIHNjYW5fcG9zLCB0ZXh0LCBmYWxzZSlcclxuICAgICAgICBpZiAoc2Nhbi5mb3VuZCA9PSBmYWxzZSkge1xyXG4gICAgICAgICAgcmV0dXJuIFJlc3VsdC5FcnIoUGFyc2VFcnJvci5JbnZhbGlkTnVtYmVyKHNjYW4udGV4dCkpXHJcbiAgICAgICAgfVxyXG4gICAgICAgIHNjYW5fcG9zID0gc2Nhbi5wb3NcclxuICAgICAgICB0ZXh0ID0gc2Nhbi50ZXh0XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBPcHRpb24uTm9uZSA9PiB7fVxyXG4gIH1cclxuXHJcbiAgbWF0Y2ggc3RyLnRvX2Zsb2F0KHRleHQpIHtcclxuICAgIFJlc3VsdC5PayhuKSA9PiB7IHJldHVybiBSZXN1bHQuT2soTGV4UmVzdWx0IHsgdG9rZW46IFRva2VuLk51bWJlckxpdChuKSwgcG9zOiBzY2FuX3BvcyB9KSB9LFxyXG4gICAgUmVzdWx0LkVycihfKSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuSW52YWxpZE51bWJlcih0ZXh0KSkgfVxyXG4gIH1cclxufVxyXG5cclxuZm4gbGlzdF9uaWxfdG9rZW5zKCkgLT4gTGlzdDxUb2tlbj4ge1xyXG4gIHJldHVybiBMaXN0Lk5pbFxyXG59XHJcblxyXG5mbiBsaXN0X3JldmVyc2VfdG9rZW5zKGxpc3Q6IExpc3Q8VG9rZW4+KSAtPiBMaXN0PFRva2VuPiB7XHJcbiAgcmV0dXJuIGxpc3RfcmV2ZXJzZV90b2tlbnNfaW50byhsaXN0LCBsaXN0X25pbF90b2tlbnMoKSlcclxufVxyXG5cclxuZm4gbGlzdF9yZXZlcnNlX3Rva2Vuc19pbnRvKGxpc3Q6IExpc3Q8VG9rZW4+LCBhY2M6IExpc3Q8VG9rZW4+KSAtPiBMaXN0PFRva2VuPiB7XHJcbiAgbWF0Y2ggbGlzdCB7XHJcbiAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBhY2MgfSxcclxuICAgIExpc3QuQ29ucyhoZWFkLCB0YWlsKSA9PiB7IHJldHVybiBsaXN0X3JldmVyc2VfdG9rZW5zX2ludG8odGFpbCwgTGlzdC5Db25zKGhlYWQsIGFjYykpIH1cclxuICB9XHJcbn1cclxuXHJcblxyXG5zdHJ1Y3QgUGFyc2VSZXN1bHQge1xyXG4gIHZhbHVlOiBKc29uVmFsdWUsXHJcbiAgcmVzdDogTGlzdDxUb2tlbj5cclxufVxyXG5cclxuc3RydWN0IE1lbWJlcnNSZXN1bHQge1xyXG4gIG1lbWJlcnM6IExpc3Q8RW50cnk+LFxyXG4gIHJlc3Q6IExpc3Q8VG9rZW4+XHJcbn1cclxuXHJcbnN0cnVjdCBFbGVtZW50c1Jlc3VsdCB7XHJcbiAgZWxlbWVudHM6IExpc3Q8SnNvblZhbHVlPixcclxuICByZXN0OiBMaXN0PFRva2VuPlxyXG59XHJcblxyXG4vLyBNYWluIHBhcnNlIGVudHJ5IHBvaW50XHJcbnB1YiBmbiBwYXJzZShpbnB1dDogc3RyaW5nKSAtPiBSZXN1bHQ8SnNvblZhbHVlLCBQYXJzZUVycm9yPiB7XHJcbiAgbWF0Y2ggbGV4KGlucHV0KSB7XHJcbiAgICBSZXN1bHQuT2sodG9rZW5zKSA9PiB7XHJcbiAgICAgIG1hdGNoIHBhcnNlX3ZhbHVlKHRva2Vucykge1xyXG4gICAgICAgIFJlc3VsdC5PayhyZXMpID0+IHtcclxuICAgICAgICAgIG1hdGNoIHJlcy5yZXN0IHtcclxuICAgICAgICAgICAgTGlzdC5Db25zKHRvaywgXykgPT4ge1xyXG4gICAgICAgICAgICAgIGlmICh0b2tlbl9lcSh0b2ssIFRva2VuLkVvZikpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBSZXN1bHQuT2socmVzLnZhbHVlKVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICByZXR1cm4gUmVzdWx0LkVycihQYXJzZUVycm9yLlVuZXhwZWN0ZWRUb2tlbih0b2tlbl9uYW1lKHRvayksIDApKVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBSZXN1bHQuT2socmVzLnZhbHVlKSB9XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgfSxcclxuICAgICAgICBSZXN1bHQuRXJyKGUpID0+IHsgcmV0dXJuIFJlc3VsdC5FcnIoZSkgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgUmVzdWx0LkVycihlKSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKGUpIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIFBhcnNlIGFueSBKU09OIHZhbHVlXHJcbmZuIHBhcnNlX3ZhbHVlKHRva2VuczogTGlzdDxUb2tlbj4pIC0+IFJlc3VsdDxQYXJzZVJlc3VsdCwgUGFyc2VFcnJvcj4ge1xyXG4gIG1hdGNoIHRva2VucyB7XHJcbiAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuVW5leHBlY3RlZEVvZikgfSxcclxuICAgIExpc3QuQ29ucyh0b2ssIHJlc3QpID0+IHtcclxuICAgICAgbWF0Y2ggdG9rIHtcclxuICAgICAgICBUb2tlbi5OdWxsTGl0ID0+IHsgcmV0dXJuIFJlc3VsdC5PayhQYXJzZVJlc3VsdCB7IHZhbHVlOiBKc29uVmFsdWUuTnVsbCwgcmVzdDogcmVzdCB9KSB9LFxyXG4gICAgICAgIFRva2VuLlRydWVMaXQgPT4geyByZXR1cm4gUmVzdWx0Lk9rKFBhcnNlUmVzdWx0IHsgdmFsdWU6IEpzb25WYWx1ZS5Cb29sKHRydWUpLCByZXN0OiByZXN0IH0pIH0sXHJcbiAgICAgICAgVG9rZW4uRmFsc2VMaXQgPT4geyByZXR1cm4gUmVzdWx0Lk9rKFBhcnNlUmVzdWx0IHsgdmFsdWU6IEpzb25WYWx1ZS5Cb29sKGZhbHNlKSwgcmVzdDogcmVzdCB9KSB9LFxyXG4gICAgICAgIFRva2VuLk51bWJlckxpdChuKSA9PiB7IHJldHVybiBSZXN1bHQuT2soUGFyc2VSZXN1bHQgeyB2YWx1ZTogSnNvblZhbHVlLk51bWJlcihuKSwgcmVzdDogcmVzdCB9KSB9LFxyXG4gICAgICAgIFRva2VuLlN0cmluZ0xpdChzKSA9PiB7IHJldHVybiBSZXN1bHQuT2soUGFyc2VSZXN1bHQgeyB2YWx1ZTogSnNvblZhbHVlLlN0cmluZyhzKSwgcmVzdDogcmVzdCB9KSB9LFxyXG4gICAgICAgIFRva2VuLkxlZnRCcmFjZSA9PiB7IHJldHVybiBwYXJzZV9vYmplY3QocmVzdCkgfSxcclxuICAgICAgICBUb2tlbi5MZWZ0QnJhY2tldCA9PiB7IHJldHVybiBwYXJzZV9hcnJheShyZXN0KSB9LFxyXG4gICAgICAgIF8gPT4geyByZXR1cm4gUmVzdWx0LkVycihQYXJzZUVycm9yLlVuZXhwZWN0ZWRUb2tlbih0b2tlbl9uYW1lKHRvayksIDApKSB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIFBhcnNlIG9iamVjdDogeyBcImtleVwiOiB2YWx1ZSwgLi4uIH1cclxuZm4gcGFyc2Vfb2JqZWN0KHRva2VuczogTGlzdDxUb2tlbj4pIC0+IFJlc3VsdDxQYXJzZVJlc3VsdCwgUGFyc2VFcnJvcj4ge1xyXG4gIG1hdGNoIHRva2VucyB7XHJcbiAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuVW5leHBlY3RlZEVvZikgfSxcclxuICAgIExpc3QuQ29ucyh0b2ssIF8pID0+IHtcclxuICAgICAgaWYgKHRva2VuX2VxKHRvaywgVG9rZW4uUmlnaHRCcmFjZSkpIHtcclxuICAgICAgICByZXR1cm4gUmVzdWx0Lk9rKFBhcnNlUmVzdWx0IHsgdmFsdWU6IEpzb25WYWx1ZS5PYmplY3QoTGlzdC5OaWwpLCByZXN0OiB0b2tlbnMgfSlcclxuICAgICAgfVxyXG4gICAgICBtYXRjaCBwYXJzZV9tZW1iZXJzKHRva2VucywgTGlzdC5OaWwpIHtcclxuICAgICAgICBSZXN1bHQuT2sobWVtYmVyc19yZXMpID0+IHtcclxuICAgICAgICAgIG1hdGNoIGV4cGVjdF90b2tlbihtZW1iZXJzX3Jlcy5yZXN0LCBUb2tlbi5SaWdodEJyYWNlKSB7XHJcbiAgICAgICAgICAgIFJlc3VsdC5PayhyZXN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFJlc3VsdC5PayhQYXJzZVJlc3VsdCB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZTogSnNvblZhbHVlLk9iamVjdChsaXN0X3JldmVyc2VfZW50cmllcyhtZW1iZXJzX3Jlcy5tZW1iZXJzKSksXHJcbiAgICAgICAgICAgICAgICByZXN0OiByZXN0XHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgUmVzdWx0LkVycihlKSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKGUpIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFJlc3VsdC5FcnIoZSkgPT4geyByZXR1cm4gUmVzdWx0LkVycihlKSB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIFBhcnNlIG9iamVjdCBtZW1iZXJzXHJcbmZuIHBhcnNlX21lbWJlcnModG9rZW5zOiBMaXN0PFRva2VuPiwgYWNjOiBMaXN0PEVudHJ5PikgLT4gUmVzdWx0PE1lbWJlcnNSZXN1bHQsIFBhcnNlRXJyb3I+IHtcclxuICBtYXRjaCB0b2tlbnMge1xyXG4gICAgTGlzdC5Db25zKHRvaywgcmVzdDEpID0+IHtcclxuICAgICAgbWF0Y2ggdG9rIHtcclxuICAgICAgICBUb2tlbi5TdHJpbmdMaXQoa2V5KSA9PiB7XHJcbiAgICAgICAgICBtYXRjaCBleHBlY3RfdG9rZW4ocmVzdDEsIFRva2VuLkNvbG9uKSB7XHJcbiAgICAgICAgICAgIFJlc3VsdC5PayhyZXN0MikgPT4ge1xyXG4gICAgICAgICAgICAgIG1hdGNoIHBhcnNlX3ZhbHVlKHJlc3QyKSB7XHJcbiAgICAgICAgICAgICAgICBSZXN1bHQuT2sodmFsX3JlcykgPT4ge1xyXG4gICAgICAgICAgICAgICAgICBsZXQgZW50cnkgPSBFbnRyeSB7IGtleToga2V5LCB2YWx1ZTogdmFsX3Jlcy52YWx1ZSB9XHJcbiAgICAgICAgICAgICAgICAgIG1hdGNoIHZhbF9yZXMucmVzdCB7XHJcbiAgICAgICAgICAgICAgICAgICAgTGlzdC5Db25zKG5leHQsIHJlc3QzKSA9PiB7XHJcbiAgICAgICAgICAgICAgICAgICAgICBpZiAodG9rZW5fZXEobmV4dCwgVG9rZW4uQ29tbWEpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXJzZV9tZW1iZXJzKHJlc3QzLCBMaXN0LkNvbnMoZW50cnksIGFjYykpXHJcbiAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gUmVzdWx0Lk9rKE1lbWJlcnNSZXN1bHQgeyBtZW1iZXJzOiBMaXN0LkNvbnMoZW50cnksIGFjYyksIHJlc3Q6IHZhbF9yZXMucmVzdCB9KVxyXG4gICAgICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICAgICAgTGlzdC5OaWwgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFJlc3VsdC5PayhNZW1iZXJzUmVzdWx0IHsgbWVtYmVyczogTGlzdC5Db25zKGVudHJ5LCBhY2MpLCByZXN0OiB2YWxfcmVzLnJlc3QgfSlcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBSZXN1bHQuRXJyKGUpID0+IHsgcmV0dXJuIFJlc3VsdC5FcnIoZSkgfVxyXG4gICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgUmVzdWx0LkVycihlKSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKGUpIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIF8gPT4geyByZXR1cm4gUmVzdWx0LkVycihQYXJzZUVycm9yLlVuZXhwZWN0ZWRUb2tlbih0b2tlbl9uYW1lKHRvayksIDApKSB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuVW5leHBlY3RlZEVvZikgfVxyXG4gIH1cclxufVxyXG5cclxuLy8gUGFyc2UgYXJyYXk6IFsgdmFsdWUsIC4uLiBdXHJcbmZuIHBhcnNlX2FycmF5KHRva2VuczogTGlzdDxUb2tlbj4pIC0+IFJlc3VsdDxQYXJzZVJlc3VsdCwgUGFyc2VFcnJvcj4ge1xyXG4gIG1hdGNoIHRva2VucyB7XHJcbiAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuVW5leHBlY3RlZEVvZikgfSxcclxuICAgIExpc3QuQ29ucyh0b2ssIF8pID0+IHtcclxuICAgICAgaWYgKHRva2VuX2VxKHRvaywgVG9rZW4uUmlnaHRCcmFja2V0KSkge1xyXG4gICAgICAgIHJldHVybiBSZXN1bHQuT2soUGFyc2VSZXN1bHQgeyB2YWx1ZTogSnNvblZhbHVlLkFycmF5KExpc3QuTmlsKSwgcmVzdDogdG9rZW5zIH0pXHJcbiAgICAgIH1cclxuICAgICAgbWF0Y2ggcGFyc2VfZWxlbWVudHModG9rZW5zLCBMaXN0Lk5pbCkge1xyXG4gICAgICAgIFJlc3VsdC5PayhlbGVtc19yZXMpID0+IHtcclxuICAgICAgICAgIG1hdGNoIGV4cGVjdF90b2tlbihlbGVtc19yZXMucmVzdCwgVG9rZW4uUmlnaHRCcmFja2V0KSB7XHJcbiAgICAgICAgICAgIFJlc3VsdC5PayhyZXN0KSA9PiB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFJlc3VsdC5PayhQYXJzZVJlc3VsdCB7XHJcbiAgICAgICAgICAgICAgICB2YWx1ZTogSnNvblZhbHVlLkFycmF5KGxpc3RfcmV2ZXJzZV92YWx1ZXMoZWxlbXNfcmVzLmVsZW1lbnRzKSksXHJcbiAgICAgICAgICAgICAgICByZXN0OiByZXN0XHJcbiAgICAgICAgICAgICAgfSlcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgUmVzdWx0LkVycihlKSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKGUpIH1cclxuICAgICAgICAgIH1cclxuICAgICAgICB9LFxyXG4gICAgICAgIFJlc3VsdC5FcnIoZSkgPT4geyByZXR1cm4gUmVzdWx0LkVycihlKSB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIFBhcnNlIGFycmF5IGVsZW1lbnRzXHJcbmZuIHBhcnNlX2VsZW1lbnRzKHRva2VuczogTGlzdDxUb2tlbj4sIGFjYzogTGlzdDxKc29uVmFsdWU+KSAtPiBSZXN1bHQ8RWxlbWVudHNSZXN1bHQsIFBhcnNlRXJyb3I+IHtcclxuICBtYXRjaCBwYXJzZV92YWx1ZSh0b2tlbnMpIHtcclxuICAgIFJlc3VsdC5Payh2YWxfcmVzKSA9PiB7XHJcbiAgICAgIG1hdGNoIHZhbF9yZXMucmVzdCB7XHJcbiAgICAgICAgTGlzdC5Db25zKHRvaywgcmVzdCkgPT4ge1xyXG4gICAgICAgICAgaWYgKHRva2VuX2VxKHRvaywgVG9rZW4uQ29tbWEpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBwYXJzZV9lbGVtZW50cyhyZXN0LCBMaXN0LkNvbnModmFsX3Jlcy52YWx1ZSwgYWNjKSlcclxuICAgICAgICAgIH1cclxuICAgICAgICAgIHJldHVybiBSZXN1bHQuT2soRWxlbWVudHNSZXN1bHQgeyBlbGVtZW50czogTGlzdC5Db25zKHZhbF9yZXMudmFsdWUsIGFjYyksIHJlc3Q6IHZhbF9yZXMucmVzdCB9KVxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgTGlzdC5OaWwgPT4geyByZXR1cm4gUmVzdWx0Lk9rKEVsZW1lbnRzUmVzdWx0IHsgZWxlbWVudHM6IExpc3QuQ29ucyh2YWxfcmVzLnZhbHVlLCBhY2MpLCByZXN0OiB2YWxfcmVzLnJlc3QgfSkgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgUmVzdWx0LkVycihlKSA9PiB7IHJldHVybiBSZXN1bHQuRXJyKGUpIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIEV4cGVjdCBhIHNwZWNpZmljIHRva2VuXHJcbmZuIGV4cGVjdF90b2tlbih0b2tlbnM6IExpc3Q8VG9rZW4+LCBleHBlY3RlZDogVG9rZW4pIC0+IFJlc3VsdDxMaXN0PFRva2VuPiwgUGFyc2VFcnJvcj4ge1xyXG4gIG1hdGNoIHRva2VucyB7XHJcbiAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuVW5leHBlY3RlZEVvZikgfSxcclxuICAgIExpc3QuQ29ucyh0b2ssIHJlc3QpID0+IHtcclxuICAgICAgaWYgKHRva2VuX2VxKHRvaywgZXhwZWN0ZWQpKSB7XHJcbiAgICAgICAgcmV0dXJuIFJlc3VsdC5PayhyZXN0KVxyXG4gICAgICB9XHJcbiAgICAgIHJldHVybiBSZXN1bHQuRXJyKFBhcnNlRXJyb3IuVW5leHBlY3RlZFRva2VuKHRva2VuX25hbWUodG9rKSwgMCkpXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBUb2tlbiBlcXVhbGl0eSBjaGVja1xyXG5mbiB0b2tlbl9lcShhOiBUb2tlbiwgYjogVG9rZW4pIC0+IGJvb2wge1xyXG4gIG1hdGNoIGEge1xyXG4gICAgVG9rZW4uTGVmdEJyYWNlID0+IHtcclxuICAgICAgbWF0Y2ggYiB7XHJcbiAgICAgICAgVG9rZW4uTGVmdEJyYWNlID0+IHsgcmV0dXJuIHRydWUgfSxcclxuICAgICAgICBfID0+IHsgcmV0dXJuIGZhbHNlIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFRva2VuLlJpZ2h0QnJhY2UgPT4ge1xyXG4gICAgICBtYXRjaCBiIHtcclxuICAgICAgICBUb2tlbi5SaWdodEJyYWNlID0+IHsgcmV0dXJuIHRydWUgfSxcclxuICAgICAgICBfID0+IHsgcmV0dXJuIGZhbHNlIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFRva2VuLkxlZnRCcmFja2V0ID0+IHtcclxuICAgICAgbWF0Y2ggYiB7XHJcbiAgICAgICAgVG9rZW4uTGVmdEJyYWNrZXQgPT4geyByZXR1cm4gdHJ1ZSB9LFxyXG4gICAgICAgIF8gPT4geyByZXR1cm4gZmFsc2UgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgVG9rZW4uUmlnaHRCcmFja2V0ID0+IHtcclxuICAgICAgbWF0Y2ggYiB7XHJcbiAgICAgICAgVG9rZW4uUmlnaHRCcmFja2V0ID0+IHsgcmV0dXJuIHRydWUgfSxcclxuICAgICAgICBfID0+IHsgcmV0dXJuIGZhbHNlIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIFRva2VuLkNvbG9uID0+IHtcclxuICAgICAgbWF0Y2ggYiB7XHJcbiAgICAgICAgVG9rZW4uQ29sb24gPT4geyByZXR1cm4gdHJ1ZSB9LFxyXG4gICAgICAgIF8gPT4geyByZXR1cm4gZmFsc2UgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgVG9rZW4uQ29tbWEgPT4ge1xyXG4gICAgICBtYXRjaCBiIHtcclxuICAgICAgICBUb2tlbi5Db21tYSA9PiB7IHJldHVybiB0cnVlIH0sXHJcbiAgICAgICAgXyA9PiB7IHJldHVybiBmYWxzZSB9XHJcbiAgICAgIH1cclxuICAgIH0sXHJcbiAgICBUb2tlbi5Fb2YgPT4ge1xyXG4gICAgICBtYXRjaCBiIHtcclxuICAgICAgICBUb2tlbi5Fb2YgPT4geyByZXR1cm4gdHJ1ZSB9LFxyXG4gICAgICAgIF8gPT4geyByZXR1cm4gZmFsc2UgfVxyXG4gICAgICB9XHJcbiAgICB9LFxyXG4gICAgXyA9PiB7IHJldHVybiBmYWxzZSB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBHZXQgdG9rZW4gbmFtZSBmb3IgZXJyb3IgbWVzc2FnZXNcclxuZm4gdG9rZW5fbmFtZSh0b2s6IFRva2VuKSAtPiBzdHJpbmcge1xyXG4gIG1hdGNoIHRvayB7XHJcbiAgICBUb2tlbi5MZWZ0QnJhY2UgPT4geyByZXR1cm4gXCJ7XCIgfSxcclxuICAgIFRva2VuLlJpZ2h0QnJhY2UgPT4geyByZXR1cm4gXCJ9XCIgfSxcclxuICAgIFRva2VuLkxlZnRCcmFja2V0ID0+IHsgcmV0dXJuIFwiW1wiIH0sXHJcbiAgICBUb2tlbi5SaWdodEJyYWNrZXQgPT4geyByZXR1cm4gXCJdXCIgfSxcclxuICAgIFRva2VuLkNvbG9uID0+IHsgcmV0dXJuIFwiOlwiIH0sXHJcbiAgICBUb2tlbi5Db21tYSA9PiB7IHJldHVybiBcIixcIiB9LFxyXG4gICAgVG9rZW4uU3RyaW5nTGl0KF8pID0+IHsgcmV0dXJuIFwic3RyaW5nXCIgfSxcclxuICAgIFRva2VuLk51bWJlckxpdChfKSA9PiB7IHJldHVybiBcIm51bWJlclwiIH0sXHJcbiAgICBUb2tlbi5UcnVlTGl0ID0+IHsgcmV0dXJuIFwidHJ1ZVwiIH0sXHJcbiAgICBUb2tlbi5GYWxzZUxpdCA9PiB7IHJldHVybiBcImZhbHNlXCIgfSxcclxuICAgIFRva2VuLk51bGxMaXQgPT4geyByZXR1cm4gXCJudWxsXCIgfSxcclxuICAgIFRva2VuLkVvZiA9PiB7IHJldHVybiBcIkVPRlwiIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIExpc3QgcmV2ZXJzZSBoZWxwZXJcclxuZm4gbGlzdF9uaWxfZW50cmllcygpIC0+IExpc3Q8RW50cnk+IHtcclxuICByZXR1cm4gTGlzdC5OaWxcclxufVxyXG5cclxuZm4gbGlzdF9yZXZlcnNlX2VudHJpZXMobGlzdDogTGlzdDxFbnRyeT4pIC0+IExpc3Q8RW50cnk+IHtcclxuICByZXR1cm4gbGlzdF9yZXZlcnNlX2VudHJpZXNfaW50byhsaXN0LCBsaXN0X25pbF9lbnRyaWVzKCkpXHJcbn1cclxuXHJcbmZuIGxpc3RfcmV2ZXJzZV9lbnRyaWVzX2ludG8obGlzdDogTGlzdDxFbnRyeT4sIGFjYzogTGlzdDxFbnRyeT4pIC0+IExpc3Q8RW50cnk+IHtcclxuICBtYXRjaCBsaXN0IHtcclxuICAgIExpc3QuTmlsID0+IHsgcmV0dXJuIGFjYyB9LFxyXG4gICAgTGlzdC5Db25zKGhlYWQsIHRhaWwpID0+IHsgcmV0dXJuIGxpc3RfcmV2ZXJzZV9lbnRyaWVzX2ludG8odGFpbCwgTGlzdC5Db25zKGhlYWQsIGFjYykpIH1cclxuICB9XHJcbn1cclxuXHJcbmZuIGxpc3RfbmlsX3ZhbHVlcygpIC0+IExpc3Q8SnNvblZhbHVlPiB7XHJcbiAgcmV0dXJuIExpc3QuTmlsXHJcbn1cclxuXHJcbmZuIGxpc3RfcmV2ZXJzZV92YWx1ZXMobGlzdDogTGlzdDxKc29uVmFsdWU+KSAtPiBMaXN0PEpzb25WYWx1ZT4ge1xyXG4gIHJldHVybiBsaXN0X3JldmVyc2VfdmFsdWVzX2ludG8obGlzdCwgbGlzdF9uaWxfdmFsdWVzKCkpXHJcbn1cclxuXHJcbmZuIGxpc3RfcmV2ZXJzZV92YWx1ZXNfaW50byhsaXN0OiBMaXN0PEpzb25WYWx1ZT4sIGFjYzogTGlzdDxKc29uVmFsdWU+KSAtPiBMaXN0PEpzb25WYWx1ZT4ge1xyXG4gIG1hdGNoIGxpc3Qge1xyXG4gICAgTGlzdC5OaWwgPT4geyByZXR1cm4gYWNjIH0sXHJcbiAgICBMaXN0LkNvbnMoaGVhZCwgdGFpbCkgPT4geyByZXR1cm4gbGlzdF9yZXZlcnNlX3ZhbHVlc19pbnRvKHRhaWwsIExpc3QuQ29ucyhoZWFkLCBhY2MpKSB9XHJcbiAgfVxyXG59XHJcblxyXG5cclxuLy8gTWFpbiBzdHJpbmdpZnkgZW50cnkgcG9pbnQgKHByZXR0eS1wcmludGVkIHdpdGggMi1zcGFjZSBpbmRlbnQpXHJcbnB1YiBmbiBzdHJpbmdpZnkodmFsdWU6IEpzb25WYWx1ZSkgLT4gc3RyaW5nIHtcclxuICByZXR1cm4gc3RyaW5naWZ5X2luZGVudCh2YWx1ZSwgMClcclxufVxyXG5cclxuLy8gU3RyaW5naWZ5IHdpdGggaW5kZW50YXRpb24gbGV2ZWxcclxuZm4gc3RyaW5naWZ5X2luZGVudCh2YWx1ZTogSnNvblZhbHVlLCBpbmRlbnQ6IGludCkgLT4gc3RyaW5nIHtcclxuICBtYXRjaCB2YWx1ZSB7XHJcbiAgICBKc29uVmFsdWUuTnVsbCA9PiB7IHJldHVybiBcIm51bGxcIiB9LFxyXG4gICAgSnNvblZhbHVlLkJvb2woYikgPT4ge1xyXG4gICAgICBpZiAoYikgeyByZXR1cm4gXCJ0cnVlXCIgfVxyXG4gICAgICByZXR1cm4gXCJmYWxzZVwiXHJcbiAgICB9LFxyXG4gICAgSnNvblZhbHVlLk51bWJlcihuKSA9PiB7IHJldHVybiBzdHIuZnJvbV9mbG9hdChuKSB9LFxyXG4gICAgSnNvblZhbHVlLlN0cmluZyhzKSA9PiB7IHJldHVybiBzdHIuY29uY2F0KHN0ci5jb25jYXQoXCJcXFwiXCIsIGVzY2FwZV9zdHJpbmcocykpLCBcIlxcXCJcIikgfSxcclxuICAgIEpzb25WYWx1ZS5BcnJheShlbGVtcykgPT4geyByZXR1cm4gc3RyaW5naWZ5X2FycmF5KGVsZW1zLCBpbmRlbnQpIH0sXHJcbiAgICBKc29uVmFsdWUuT2JqZWN0KG1lbWJlcnMpID0+IHsgcmV0dXJuIHN0cmluZ2lmeV9vYmplY3QobWVtYmVycywgaW5kZW50KSB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBTdHJpbmdpZnkgYXJyYXkgd2l0aCBpbmRlbnRhdGlvblxyXG5mbiBzdHJpbmdpZnlfYXJyYXkoZWxlbXM6IExpc3Q8SnNvblZhbHVlPiwgaW5kZW50OiBpbnQpIC0+IHN0cmluZyB7XHJcbiAgbWF0Y2ggZWxlbXMge1xyXG4gICAgTGlzdC5OaWwgPT4geyByZXR1cm4gXCJbXVwiIH0sXHJcbiAgICBfID0+IHtcclxuICAgICAgbGV0IGlubmVyID0gc3RyaW5naWZ5X2VsZW1lbnRzKGVsZW1zLCBpbmRlbnQgKyAxLCB0cnVlKVxyXG4gICAgICByZXR1cm4gc3RyLmNvbmNhdChzdHIuY29uY2F0KFwiW1xcdTAwMEFcIiwgaW5uZXIpLCBzdHIuY29uY2F0KFwiXFx1MDAwQVwiLCBzdHIuY29uY2F0KG1ha2VfaW5kZW50KGluZGVudCksIFwiXVwiKSkpXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG4vLyBTdHJpbmdpZnkgYXJyYXkgZWxlbWVudHNcclxuZm4gc3RyaW5naWZ5X2VsZW1lbnRzKGVsZW1zOiBMaXN0PEpzb25WYWx1ZT4sIGluZGVudDogaW50LCBmaXJzdDogYm9vbCkgLT4gc3RyaW5nIHtcclxuICBtYXRjaCBlbGVtcyB7XHJcbiAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBcIlwiIH0sXHJcbiAgICBMaXN0LkNvbnMoaGVhZCwgdGFpbCkgPT4ge1xyXG4gICAgICBsZXQgcHJlZml4ID0gcHJlZml4X2ZvcihmaXJzdClcclxuICAgICAgbGV0IGVsZW1fc3RyID0gc3RyLmNvbmNhdChtYWtlX2luZGVudChpbmRlbnQpLCBzdHJpbmdpZnlfaW5kZW50KGhlYWQsIGluZGVudCkpXHJcbiAgICAgIG1hdGNoIHRhaWwge1xyXG4gICAgICAgIExpc3QuTmlsID0+IHsgcmV0dXJuIHN0ci5jb25jYXQocHJlZml4LCBlbGVtX3N0cikgfSxcclxuICAgICAgICBfID0+IHsgcmV0dXJuIHN0ci5jb25jYXQoc3RyLmNvbmNhdChwcmVmaXgsIGVsZW1fc3RyKSwgc3RyaW5naWZ5X2VsZW1lbnRzKHRhaWwsIGluZGVudCwgZmFsc2UpKSB9XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIFN0cmluZ2lmeSBvYmplY3Qgd2l0aCBpbmRlbnRhdGlvblxyXG5mbiBzdHJpbmdpZnlfb2JqZWN0KG1lbWJlcnM6IExpc3Q8RW50cnk+LCBpbmRlbnQ6IGludCkgLT4gc3RyaW5nIHtcclxuICBtYXRjaCBtZW1iZXJzIHtcclxuICAgIExpc3QuTmlsID0+IHsgcmV0dXJuIFwie31cIiB9LFxyXG4gICAgXyA9PiB7XHJcbiAgICAgIGxldCBpbm5lciA9IHN0cmluZ2lmeV9tZW1iZXJzKG1lbWJlcnMsIGluZGVudCArIDEsIHRydWUpXHJcbiAgICAgIHJldHVybiBzdHIuY29uY2F0KHN0ci5jb25jYXQoXCJ7XFx1MDAwQVwiLCBpbm5lciksIHN0ci5jb25jYXQoXCJcXHUwMDBBXCIsIHN0ci5jb25jYXQobWFrZV9pbmRlbnQoaW5kZW50KSwgXCJ9XCIpKSlcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbi8vIFN0cmluZ2lmeSBvYmplY3QgbWVtYmVyc1xyXG5mbiBzdHJpbmdpZnlfbWVtYmVycyhtZW1iZXJzOiBMaXN0PEVudHJ5PiwgaW5kZW50OiBpbnQsIGZpcnN0OiBib29sKSAtPiBzdHJpbmcge1xyXG4gIG1hdGNoIG1lbWJlcnMge1xyXG4gICAgTGlzdC5OaWwgPT4geyByZXR1cm4gXCJcIiB9LFxyXG4gICAgTGlzdC5Db25zKGhlYWQsIHRhaWwpID0+IHtcclxuICAgICAgbGV0IHByZWZpeCA9IHByZWZpeF9mb3IoZmlyc3QpXHJcbiAgICAgIGxldCBrZXlfc3RyID0gc3RyLmNvbmNhdChzdHIuY29uY2F0KFwiXFxcIlwiLCBlc2NhcGVfc3RyaW5nKGhlYWQua2V5KSksIFwiXFxcIlwiKVxyXG4gICAgICBsZXQgdmFsX3N0ciA9IHN0cmluZ2lmeV9pbmRlbnQoaGVhZC52YWx1ZSwgaW5kZW50KVxyXG4gICAgICBsZXQgbWVtYmVyX3N0ciA9IHN0ci5jb25jYXQobWFrZV9pbmRlbnQoaW5kZW50KSwgc3RyLmNvbmNhdChrZXlfc3RyLCBzdHIuY29uY2F0KFwiOiBcIiwgdmFsX3N0cikpKVxyXG4gICAgICBtYXRjaCB0YWlsIHtcclxuICAgICAgICBMaXN0Lk5pbCA9PiB7IHJldHVybiBzdHIuY29uY2F0KHByZWZpeCwgbWVtYmVyX3N0cikgfSxcclxuICAgICAgICBfID0+IHsgcmV0dXJuIHN0ci5jb25jYXQoc3RyLmNvbmNhdChwcmVmaXgsIG1lbWJlcl9zdHIpLCBzdHJpbmdpZnlfbWVtYmVycyh0YWlsLCBpbmRlbnQsIGZhbHNlKSkgfVxyXG4gICAgICB9XHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mbiBwcmVmaXhfZm9yKGZpcnN0OiBib29sKSAtPiBzdHJpbmcge1xyXG4gIGlmIChmaXJzdCkgeyByZXR1cm4gXCJcIiB9XHJcbiAgcmV0dXJuIFwiLFxcdTAwMEFcIlxyXG59XHJcblxyXG4vLyBDcmVhdGUgaW5kZW50YXRpb24gc3RyaW5nICgyIHNwYWNlcyBwZXIgbGV2ZWwpXHJcbmZuIG1ha2VfaW5kZW50KGxldmVsOiBpbnQpIC0+IHN0cmluZyB7XHJcbiAgaWYgKGxldmVsIDw9IDApIHsgcmV0dXJuIFwiXCIgfVxyXG4gIHJldHVybiBzdHIuY29uY2F0KFwiICBcIiwgbWFrZV9pbmRlbnQobGV2ZWwgLSAxKSlcclxufVxyXG5cclxuLy8gRXNjYXBlIHN0cmluZyBmb3IgSlNPTlxyXG5mbiBlc2NhcGVfc3RyaW5nKHM6IHN0cmluZykgLT4gc3RyaW5nIHtcclxuICByZXR1cm4gZXNjYXBlX3N0cmluZ19hdChzLCAwLCBcIlwiKVxyXG59XHJcblxyXG5mbiBlc2NhcGVfc3RyaW5nX2F0KHM6IHN0cmluZywgcG9zOiBpbnQsIGFjYzogc3RyaW5nKSAtPiBzdHJpbmcge1xyXG4gIG1hdGNoIHN0ci5jaGFyX2F0KHMsIHBvcykge1xyXG4gICAgT3B0aW9uLk5vbmUgPT4geyByZXR1cm4gYWNjIH0sXHJcbiAgICBPcHRpb24uU29tZShjKSA9PiB7XHJcbiAgICAgIGxldCBlc2NhcGVkID0gZXNjYXBlX2pzb25fY2hhcihjKVxyXG4gICAgICByZXR1cm4gZXNjYXBlX3N0cmluZ19hdChzLCBwb3MgKyAxLCBzdHIuY29uY2F0KGFjYywgZXNjYXBlZCkpXHJcbiAgICB9XHJcbiAgfVxyXG59XHJcblxyXG5mbiBlc2NhcGVfanNvbl9jaGFyKGM6IHN0cmluZykgLT4gc3RyaW5nIHtcclxuICBpZiAoc3RyLmVxKGMsIFwiXFxcIlwiKSkgeyByZXR1cm4gXCJcXFxcXFxcIlwiIH1cclxuICBpZiAoc3RyLmVxKGMsIFwiXFxcXFwiKSkgeyByZXR1cm4gXCJcXFxcXFxcXFwiIH1cclxuICBpZiAoc3RyLmVxKGMsIFwiXFx1MDAwQVwiKSkgeyByZXR1cm4gXCJcXFxcblwiIH1cclxuICBpZiAoc3RyLmVxKGMsIFwiXFx1MDAwRFwiKSkgeyByZXR1cm4gXCJcXFxcclwiIH1cclxuICBpZiAoc3RyLmVxKGMsIFwiXFx1MDAwOVwiKSkgeyByZXR1cm4gXCJcXFxcdFwiIH1cclxuICByZXR1cm4gY1xyXG59XHJcblxyXG5cclxucHViIGZuIG1haW4oKSAtPiB2b2lkIHtcclxuICBpby5wcmludGxuKFwiTHVtaW5hIEpTT04gUGFyc2VyXCIpXHJcbiAgaW8ucHJpbnRsbihcIkVudGVyIEpTT04gKG9yICdleGl0JyB0byBxdWl0KTpcIilcclxuICBpby5wcmludGxuKFwiXCIpXHJcblxyXG4gIHJlcGwoKVxyXG59XHJcblxyXG5mbiByZXBsKCkgLT4gdm9pZCB7XHJcbiAgaW8ucHJpbnQoXCI+IFwiKVxyXG5cclxuICBtYXRjaCBpby5yZWFkTGluZSgpIHtcclxuICAgIE9wdGlvbi5Tb21lKGlucHV0KSA9PiB7XHJcbiAgICAgIGlmIChzdHIuZXEoaW5wdXQsIFwiZXhpdFwiKSkge1xyXG4gICAgICAgIGlvLnByaW50bG4oXCJHb29kYnllIVwiKVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGlmIChzdHIuZXEoaW5wdXQsIFwiXCIpKSB7XHJcbiAgICAgICAgICByZXBsKClcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgcHJvY2Vzc19pbnB1dChpbnB1dClcclxuICAgICAgICAgIHJlcGwoKVxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfSxcclxuICAgIE9wdGlvbi5Ob25lID0+IHtcclxuICAgICAgaW8ucHJpbnRsbihcIk5vIGlucHV0IGF2YWlsYWJsZVwiKVxyXG4gICAgICByZXBsKClcclxuICAgIH1cclxuICB9XHJcbn1cclxuXHJcbmZuIHByb2Nlc3NfaW5wdXQoaW5wdXQ6IHN0cmluZykgLT4gdm9pZCB7XHJcbiAgbWF0Y2ggcGFyc2UoaW5wdXQpIHtcclxuICAgIFJlc3VsdC5Payh2YWx1ZSkgPT4ge1xyXG4gICAgICBpby5wcmludGxuKFwiUGFyc2VkIHN1Y2Nlc3NmdWxseTpcIilcclxuICAgICAgaW8ucHJpbnRsbihzdHJpbmdpZnkodmFsdWUpKVxyXG4gICAgICBpby5wcmludGxuKFwiXCIpXHJcbiAgICB9LFxyXG4gICAgUmVzdWx0LkVycihlcnJvcikgPT4ge1xyXG4gICAgICBpby5wcmludGxuKFwiUGFyc2UgZXJyb3I6XCIpXHJcbiAgICAgIGlvLnByaW50bG4oZm9ybWF0X2Vycm9yKGVycm9yKSlcclxuICAgICAgaW8ucHJpbnRsbihcIlwiKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxuZm4gZm9ybWF0X2Vycm9yKGVycm9yOiBQYXJzZUVycm9yKSAtPiBzdHJpbmcge1xyXG4gIG1hdGNoIGVycm9yIHtcclxuICAgIFBhcnNlRXJyb3IuVW5leHBlY3RlZFRva2VuKHRvaywgcG9zKSA9PiB7XHJcbiAgICAgIHJldHVybiBzdHIuY29uY2F0KFwiVW5leHBlY3RlZCB0b2tlbjogXCIsIHN0ci5jb25jYXQodG9rLCBzdHIuY29uY2F0KFwiIGF0IHBvc2l0aW9uIFwiLCBzdHIuZnJvbV9pbnQocG9zKSkpKVxyXG4gICAgfSxcclxuICAgIFBhcnNlRXJyb3IuVW5leHBlY3RlZEVvZiA9PiB7IHJldHVybiBcIlVuZXhwZWN0ZWQgZW5kIG9mIGlucHV0XCIgfSxcclxuICAgIFBhcnNlRXJyb3IuSW52YWxpZE51bWJlcihzKSA9PiB7IHJldHVybiBzdHIuY29uY2F0KFwiSW52YWxpZCBudW1iZXI6IFwiLCBzKSB9LFxyXG4gICAgUGFyc2VFcnJvci5JbnZhbGlkU3RyaW5nKHMpID0+IHsgcmV0dXJuIHN0ci5jb25jYXQoXCJJbnZhbGlkIHN0cmluZzogXCIsIHMpIH0sXHJcbiAgICBQYXJzZUVycm9yLlVuZXhwZWN0ZWRDaGFyKGMsIHBvcykgPT4ge1xyXG4gICAgICByZXR1cm4gc3RyLmNvbmNhdChcIlVuZXhwZWN0ZWQgY2hhcmFjdGVyOiBcIiwgc3RyLmNvbmNhdChjLCBzdHIuY29uY2F0KFwiIGF0IHBvc2l0aW9uIFwiLCBzdHIuZnJvbV9pbnQocG9zKSkpKVxyXG4gICAgfVxyXG4gIH1cclxufVxyXG5cclxubWFpbigpXHJcblxyXG4iXX0=
