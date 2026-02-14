import { io, str, math, list, Result, Option, __set, formatValue, LuminaPanic } from "./lumina-runtime.js";
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
  let len = str.length(input);
  if ((next_pos >= len)) {
    return { tag: "Ok", values: [{ tag: "Cons", values: [{ tag: "Eof", values: [] }, acc] }] };
  }
  let __match1 = str.char_at(input, next_pos);
  if ((__match1.tag == "Some")) {
    let c = __match1.values[0];
    if (str.eq(c, "{")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "LeftBrace", values: [] }, acc] });
    }
    if (str.eq(c, "}")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "RightBrace", values: [] }, acc] });
    }
    if (str.eq(c, "[")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "LeftBracket", values: [] }, acc] });
    }
    if (str.eq(c, "]")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "RightBracket", values: [] }, acc] });
    }
    if (str.eq(c, ":")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "Colon", values: [] }, acc] });
    }
    if (str.eq(c, ",")) {
      return lex_tokens(input, (next_pos + 1), { tag: "Cons", values: [{ tag: "Comma", values: [] }, acc] });
    }
    if (str.eq(c, "\"")) {
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
    if ((str.is_digit(c) || str.eq(c, "-"))) {
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
  let __match4 = str.char_at(input, pos);
  if ((__match4.tag == "Some")) {
    let c = __match4.values[0];
    if (str.is_whitespace(c)) {
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
  let __match5 = str.char_at(literal, idx);
  if ((__match5.tag == "None")) {
    return true;
  } else {
    if ((__match5.tag == "Some")) {
      let ch = __match5.values[0];
      let __match6 = str.char_at(input, (pos + idx));
      if ((__match6.tag == "Some")) {
        let c = __match6.values[0];
        if (str.eq(c, ch)) {
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
  let __match7 = str.char_at(input, pos);
  if ((__match7.tag == "None")) {
    return true;
  } else {
    if ((__match7.tag == "Some")) {
      let c = __match7.values[0];
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
    }
  }
}
function escape_char(c) {
  if (str.eq(c, "\"")) {
    return { tag: "Some", values: ["\""] };
  }
  if (str.eq(c, "\\")) {
    return { tag: "Some", values: ["\\"] };
  }
  if (str.eq(c, "/")) {
    return { tag: "Some", values: ["/"] };
  }
  if (str.eq(c, "b")) {
    return { tag: "Some", values: ["\u0000008"] };
  }
  if (str.eq(c, "f")) {
    return { tag: "Some", values: ["\u000000C"] };
  }
  if (str.eq(c, "n")) {
    return { tag: "Some", values: ["\u000000A"] };
  }
  if (str.eq(c, "r")) {
    return { tag: "Some", values: ["\u000000D"] };
  }
  if (str.eq(c, "t")) {
    return { tag: "Some", values: ["\u0000009"] };
  }
  return { tag: "None", values: [] };
}
function lex_string(input, pos, acc) {
  let __match8 = str.char_at(input, pos);
  if ((__match8.tag == "None")) {
    return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
  } else {
    if ((__match8.tag == "Some")) {
      let c = __match8.values[0];
      if (str.eq(c, "\"")) {
        return { tag: "Ok", values: [{ token: { tag: "StringLit", values: [acc] }, pos: (pos + 1) }] };
      }
      if (str.eq(c, "\\")) {
        let __match9 = str.char_at(input, (pos + 1));
        if ((__match9.tag == "None")) {
          return { tag: "Err", values: [{ tag: "UnexpectedEof", values: [] }] };
        } else {
          if ((__match9.tag == "Some")) {
            let esc = __match9.values[0];
            let __match10 = escape_char(esc);
            if ((__match10.tag == "Some")) {
              let decoded = __match10.values[0];
              return lex_string(input, (pos + 2), str.concat(acc, decoded));
            } else {
              if ((__match10.tag == "None")) {
                return { tag: "Err", values: [{ tag: "InvalidString", values: [acc] }] };
              }
            }
          }
        }
      }
      return lex_string(input, (pos + 1), str.concat(acc, c));
    }
  }
}
function take_digits(input, pos, acc, found) {
  let __match11 = str.char_at(input, pos);
  if ((__match11.tag == "Some")) {
    let c = __match11.values[0];
    if (str.is_digit(c)) {
      return take_digits(input, (pos + 1), str.concat(acc, c), true);
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
  let __match12 = str.char_at(input, scan_pos);
  if ((__match12.tag == "Some")) {
    let c = __match12.values[0];
    if (str.eq(c, "-")) {
      text = str.concat(text, "-");
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
  let __match13 = str.char_at(input, scan_pos);
  if ((__match13.tag == "Some")) {
    let c = __match13.values[0];
    if (str.eq(c, ".")) {
      scan = take_digits(input, (scan_pos + 1), str.concat(text, "."), false);
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
  let __match14 = str.char_at(input, scan_pos);
  if ((__match14.tag == "Some")) {
    let c = __match14.values[0];
    if ((str.eq(c, "e") || str.eq(c, "E"))) {
      text = str.concat(text, c);
      scan_pos = (scan_pos + 1);
      let __match15 = str.char_at(input, scan_pos);
      if ((__match15.tag == "Some")) {
        let sign = __match15.values[0];
        if ((str.eq(sign, "+") || str.eq(sign, "-"))) {
          text = str.concat(text, sign);
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
  let __match16 = str.to_float(text);
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
        return str.from_float(n);
      } else {
        if ((__match48.tag == "String")) {
          let s = __match48.values[0];
          return str.concat(str.concat("\"", escape_string(s)), "\"");
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
    return str.concat(str.concat("[\u000000A", inner), str.concat("\u000000A", str.concat(make_indent(indent), "]")));
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
      let elem_str = str.concat(make_indent(indent), stringify_indent(head, indent));
      let __match51 = tail;
      if ((__match51.tag == "Nil")) {
        return str.concat(prefix, elem_str);
      } else {
        return str.concat(str.concat(prefix, elem_str), stringify_elements(tail, indent, false));
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
    return str.concat(str.concat("{\u000000A", inner), str.concat("\u000000A", str.concat(make_indent(indent), "}")));
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
      let key_str = str.concat(str.concat("\"", escape_string(head.key)), "\"");
      let val_str = stringify_indent(head.value, indent);
      let member_str = str.concat(make_indent(indent), str.concat(key_str, str.concat(": ", val_str)));
      let __match54 = tail;
      if ((__match54.tag == "Nil")) {
        return str.concat(prefix, member_str);
      } else {
        return str.concat(str.concat(prefix, member_str), stringify_members(tail, indent, false));
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
  return str.concat("  ", make_indent((level - 1)));
}
function escape_string(s) {
  return escape_string_at(s, 0, "");
}
function escape_string_at(s, pos, acc) {
  let __match55 = str.char_at(s, pos);
  if ((__match55.tag == "None")) {
    return acc;
  } else {
    if ((__match55.tag == "Some")) {
      let c = __match55.values[0];
      let escaped = escape_json_char(c);
      return escape_string_at(s, (pos + 1), str.concat(acc, escaped));
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
  let input = read_all_input("");
  if (str.eq(input, "")) {
    io.eprintln("Error: No input provided");
  } else {
    process_json(input);
  }
}
function read_all_input(acc) {
  let __match56 = io.readLine();
  if ((__match56.tag == "Some")) {
    let line = __match56.values[0];
    return read_all_input(str.concat(str.concat(acc, line), "\n"));
  } else {
    if ((__match56.tag == "None")) {
      return acc;
    }
  }
}
function process_json(input) {
  let __match57 = parse(input);
  if ((__match57.tag == "Ok")) {
    let value = __match57.values[0];
    io.println(stringify(value));
  } else {
    if ((__match57.tag == "Err")) {
      let error = __match57.values[0];
      io.eprintln("Parse error:");
      io.eprintln(format_error(error));
    }
  }
}
function format_error(error) {
  let __match58 = error;
  if ((__match58.tag == "UnexpectedToken")) {
    let tok = __match58.values[0];
    let pos = __match58.values[1];
    return str.concat("Unexpected token: ", str.concat(tok, str.concat(" at position ", str.from_int(pos))));
  } else {
    if ((__match58.tag == "UnexpectedEof")) {
      return "Unexpected end of input";
    } else {
      if ((__match58.tag == "InvalidNumber")) {
        let s = __match58.values[0];
        return str.concat("Invalid number: ", s);
      } else {
        if ((__match58.tag == "InvalidString")) {
          let s = __match58.values[0];
          return str.concat("Invalid string: ", s);
        } else {
          if ((__match58.tag == "UnexpectedChar")) {
            let c = __match58.values[0];
            let pos = __match58.values[1];
            return str.concat("Unexpected character: ", str.concat(c, str.concat(" at position ", str.from_int(pos))));
          }
        }
      }
    }
  }
}
main();
export { io, str, math, list, Result, Option, __set, formatValue, LuminaPanic };
