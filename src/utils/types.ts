export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Location {
  start: Position;
  end: Position;
}

export interface ErrorFormatter {
  (message: string, location?: Location): string;
}
