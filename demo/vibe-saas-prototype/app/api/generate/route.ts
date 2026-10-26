import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  const { prompt } = await req.json();

  // Flaw 1: Missing maxOutputTokens budget
  // Flaw 2: Missing user credit deduction / quota tracking
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt
  });

  return Response.json({ text: response.text });
}
