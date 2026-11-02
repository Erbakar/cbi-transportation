import { AppError } from './runtime';
export async function boundedJSON(req: Request, limit = 32768): Promise<unknown> {
    const reader = req.body?.getReader();
    if (!reader)
        throw new AppError('İstek gerekli.');
    let size = 0, text = '';
    const decoder = new TextDecoder();
    while (true) {
        const p = await reader.read();
        if (p.done)
            break;
        size += p.value.byteLength;
        if (size > limit) {
            await reader.cancel();
            throw new AppError('İstek çok uzun.', 413);
        }
        text += decoder.decode(p.value, { stream: true });
    }
    text += decoder.decode();
    try {
        return JSON.parse(text);
    }
    catch {
        throw new AppError('İstek geçersiz.');
    }
}
