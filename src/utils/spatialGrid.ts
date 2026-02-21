export class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, number[]>;

  constructor(cellSize = 4.0) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() { this.cells.clear(); }

  private getKey(x: number, z: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
  }

  insert(idx: number, x: number, z: number) {
    const key = this.getKey(x, z);
    let cell = this.cells.get(key);
    if (!cell) { cell = []; this.cells.set(key, cell); }
    cell.push(idx);
  }

  getNeighbors(x: number, z: number): number[] {
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const result: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const cell = this.cells.get(`${cx + dx},${cz + dz}`);
        if (cell) result.push(...cell);
      }
    }
    return result;
  }
}
