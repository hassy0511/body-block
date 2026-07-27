// poly-decomp は型定義を同梱していないため、使う範囲だけ宣言する。
// Matter へ渡すだけなので、内部の詳細な型までは要らない。
declare module 'poly-decomp' {
  type Polygon = [number, number][];

  const decomp: {
    quickDecomp(polygon: Polygon): Polygon[];
    decomp(polygon: Polygon): Polygon[] | false;
    isSimple(polygon: Polygon): boolean;
    removeCollinearPoints(polygon: Polygon, precision?: number): number;
    removeDuplicatePoints(polygon: Polygon, precision?: number): void;
    makeCCW(polygon: Polygon): boolean;
  };

  export default decomp;
}
