export interface RadarFrame { product: string; time: string }

export const radarFrameKey = ({ product, time }: RadarFrame) => `radar:${product}:${time}`;
export const radarFrameErrorKey = ({ product, time }: RadarFrame) => `radar-error:${product}:${time}`;
