start = _ expr:expression _ { return expr; }

expression =
    left:term _ operators:(("+" / "-") _ term)* {
        let result = left;
        for (let i = 0; i < operators.length; i++) {
            const op = operators[i][0];
            const right = operators[i][2];
            result = {
                type: "BinaryExpression",
                operator: op,
                left: result,
                right: right
            };
        }
        return result;
    }

term =
    left:factor _ operators:(("*" / "/") _ factor)* {
        let result = left;
        for (let i = 0; i < operators.length; i++) {
            const op = operators[i][0];
            const right = operators[i][2];
            result = {
                type: "BinaryExpression",
                operator: op,
                left: result,
                right: right
            };
        }
        return result;
    }

factor =
    number
    / "(" _ expr:expression _ ")" { return expr; }

number "number" = digits:([0-9]+ ("." [0-9]+)?) {
    return {
        type: "NumberLiteral",
        value: parseFloat(text())
    };
}

_ "whitespace" = [ \t\n\r]*