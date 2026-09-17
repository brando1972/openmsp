declare module 'sharp' {
  const sharp: any;
  export namespace sharp {
    export interface Metadata {
      width?: number;
      height?: number;
      [key: string]: any;
    }
  }
  export default sharp;
}
