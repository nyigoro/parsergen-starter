# Lumina CLI File Processor

A small CLI example that reads a file path from stdin and prints line/character counts.

## Build

```bash
lumina compile examples/cli-file-processor/main.lm -o examples/cli-file-processor/file-processor.js --target esm
```

## Run

```bash
node examples/cli-file-processor/file-processor.js
```

Then enter a file path when prompted. For a quick test:

```bash
node examples/cli-file-processor/file-processor.js
```

Input:
```
examples/cli-file-processor/sample.txt
```
