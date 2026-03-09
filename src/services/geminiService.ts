import { GoogleGenAI, Type } from "@google/genai";
import { TripDetails, QuotationItem, GroundServiceRate } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const chatWithAI = async (
  messages: { role: 'user' | 'assistant'; content: string }[],
  availableRates: GroundServiceRate[]
): Promise<{ text: string; quotation?: { details: TripDetails; items: QuotationItem[]; draftText?: string } }> => {
  const model = "gemini-3.1-pro-preview";
  const segmentsList = Array.from(new Set(availableRates.map(r => r.segment))).join(", ");
  
  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model' as const,
    parts: [{ text: m.content }]
  }));

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: `
        You are a professional travel agency assistant. Your goal is to help users build travel quotations.
        
        Available Segments in our database: ${segmentsList}
        
        Guidelines:
        1. Be conversational and helpful, like ChatGPT.
        2. If the user provides trip details (client name, trip name, pax, dates, segments), you should prepare a quotation.
        3. When you have enough information to generate a quotation, you MUST include a special JSON block at the end of your response wrapped in <QUOTATION_DATA> tags.
        4. The JSON block must follow this schema:
           {
             "details": {
               "clientName": string,
               "tripName": string,
               "paxCount": number,
               "startDate": "YYYY-MM-DD",
               "endDate": "YYYY-MM-DD",
               "segments": string[],
               "additionalNotes": string
             },
             "items": [
               { "segment": string, "description": string, "quantity": number, "unitPrice": number, "totalPrice": number }
             ],
             "draftText": string (a professional markdown draft of the quotation)
           }
        5. For the items, use the segment names exactly as they appear in the Available Segments list.
        6. If information is missing, ask the user for it politely.
        7. Current Date: ${new Date().toISOString().split('T')[0]}
      `,
    },
  });

  const text = response.text;
  let quotation;

  const match = text.match(/<QUOTATION_DATA>([\s\S]*?)<\/QUOTATION_DATA>/);
  if (match) {
    try {
      quotation = JSON.parse(match[1]);
    } catch (e) {
      console.error("Failed to parse quotation data from AI response", e);
    }
  }

  return { 
    text: text.replace(/<QUOTATION_DATA>[\s\S]*?<\/QUOTATION_DATA>/, "").trim(), 
    quotation 
  };
};

export async function draftQuotationText(details: TripDetails, items: QuotationItem[]): Promise<string> {
  const itemsText = items.map(item => `- ${item.segment}: ${item.description} (${item.quantity} x ${item.unitPrice}) = ${item.totalPrice}`).join("\n");
  
  const prompt = `
    You are a professional travel consultant. Draft a professional and welcoming travel quotation for a client.
    
    Client Name: ${details.clientName}
    Trip Name: ${details.tripName}
    Pax Count: ${details.paxCount}
    Dates: ${details.startDate} to ${details.endDate}
    Additional Notes: ${details.additionalNotes}
    
    Proposed Itinerary/Items:
    ${itemsText}
    
    Total Amount: ${items.reduce((sum, item) => sum + item.totalPrice, 0)}
    
    Please write a professional email/document draft that includes:
    1. A warm greeting.
    2. A summary of the trip.
    3. A breakdown of the services.
    4. Important terms or inclusions.
    5. A professional closing.
    
    Format the output as Markdown.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "Failed to generate draft.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating draft. Please try again.";
  }
}
