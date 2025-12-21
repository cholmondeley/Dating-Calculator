import { GoogleGenAI } from "@google/genai";
import { FilterState } from "../types";

export const getGeminiInsight = async (filters: FilterState): Promise<string> => {
  if (!process.env.API_KEY) {
    return "API Key not configured for AI insights.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Construct location string
    let location = 'USA';
    if (filters.selectedCBSA) location = `Metro Area ${filters.selectedCBSA}`; // Ideally map ID to name
    else if (filters.selectedState && filters.selectedState !== 'US') location = filters.selectedState;

    const prompt = `
      Act as a witty, data-savvy dating coach. 
      The user is looking for a partner with these stats in the US:
      - Gender: ${filters.gender}
      - Location: ${location}
      - Age: ${filters.ageRange[0]}-${filters.ageRange[1]}
      - Income: $${filters.incomeRange[0]}k - $${filters.incomeRange[1]}k
      - Height: ${Math.floor(filters.heightRange[0]/12)}'${filters.heightRange[0]%12}" - ${Math.floor(filters.heightRange[1]/12)}'${filters.heightRange[1]%12}"
      - Needs Degree: ${!filters.education.noDegree}
      - Body Type: ${filters.bodyTypes.join(', ')}
      - No Kids: ${filters.excludePeopleWithKids}
      - Politics: ${Object.keys(filters.politics).filter(k => filters.politics[k as keyof typeof filters.politics]).join(', ')}
      - Religion: ${Object.keys(filters.religion).filter(k => filters.religion[k as keyof typeof filters.religion]).join(', ')}

      Give me a ONE sentence fun, slightly roast-y, but encouraging comment about the statistical probability of finding this person. 
      Keep it under 30 words.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "Could not generate insight.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "AI is currently on a coffee break.";
  }
};