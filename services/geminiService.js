
import { GoogleGenAI } from "@google/genai";
// Types are for development; they are removed/commented in the transpiled JS
// import { TranscriptionResult } from "../types.js";
import { LANGUAGES } from '../languages.js';

// --- BEGIN CRITICAL API KEY SECTION ---
// ###################################################################################
// #                                                                                 #
// #                           !!! IMPORTANT SECURITY NOTICE !!!                     #
// #                                                                                 #
// # THE API KEY BELOW IS SET FOR LOCAL TESTING.                                     #
// #                                                                                 #
// # DO NOT DEPLOY THIS FILE WITH A REAL API KEY HARDCODED HERE TO A PUBLIC          #
// # REPOSITORY OR PUBLIC WEBSITE.                                                   #
// # Hardcoding API keys in client-side code is a major security risk.               #
// # Anyone viewing your website can see this key.                                   #
// #                                                                                 #
// # For production/deployment, use environment variables and a secure backend       #
// # proxy or a secure build-time injection method.                                  #
// #                                                                                 #
// ###################################################################################
const MANUALLY_SET_API_KEY = "AIzaSyAdMCwl5J3wNhEm7mx-izx9GY0aDDBModM"; // API Key has been inserted here.
// --- END CRITICAL API KEY SECTION ---

let ai = null;

if (MANUALLY_SET_API_KEY && MANUALLY_SET_API_KEY !== "YOUR_API_KEY_HERE_PLEASE_REPLACE_THIS_STRING") {
  try {
    ai = new GoogleGenAI({ apiKey: MANUALLY_SET_API_KEY });
    console.info("Gemini AI Client initialized with manually set API key. Remember this is for local testing and is insecure for deployment.");
  } catch (e) {
    console.error("Failed to initialize GoogleGenAI with the manually provided API_KEY. The key might be invalid or there could be other issues:", e);
    // This error implies the key was found but was invalid or service couldn't init.
  }
} else if (MANUALLY_SET_API_KEY === "YOUR_API_KEY_HERE_PLEASE_REPLACE_THIS_STRING") {
  console.error(
    "CRITICAL: Gemini API Key is still set to the placeholder string in services/geminiService.js. " +
    "You MUST replace 'YOUR_API_KEY_HERE_PLEASE_REPLACE_THIS_STRING' with your actual Gemini API key. " +
    "The application's AI features will NOT function until this is done."
  );
} else {
  // This case (e.g. empty string if user modified it incorrectly)
  console.warn(
    "MANUALLY_SET_API_KEY in services/geminiService.js is missing or empty (and not the placeholder). " +
    "Gemini Service will not function. Please ensure a valid API key is provided if you intended to set one manually."
  );
}


const MODEL_NAME = "gemini-2.5-flash-preview-04-17";

// Chat instance
let chatInstance = null;
let currentChatLanguage = null;

export const transcribeContent = async (
  base64Data,
  mimeType,
  targetLanguageCode
) => {
  if (!ai) {
    return { text: "", error: "Gemini API client is not initialized. This usually means the API_KEY is missing, invalid, or was not correctly set in services/geminiService.js. Please check your setup and the browser console for more details." };
  }
  resetChatSession();

  const languageObj = LANGUAGES.find(lang => lang.code === targetLanguageCode);
  const fullLanguageName = languageObj ? languageObj.name : targetLanguageCode;

  const systemInstructionText = `You are an expert audio transcription and translation service.
Your task is to transcribe the provided audio and translate it into ${fullLanguageName} (language code: ${targetLanguageCode}).
The entire output, including timestamps and transcribed text, MUST be in ${fullLanguageName} (language code: ${targetLanguageCode}). No other language should be used in your response.
Aim for natural and accurate translation.`;

  const promptText = `Please process the attached audio file following these instructions:
1.  Automatically detect the original language of the audio.
2.  Transcribe the full spoken content from the audio, including non-lexical vocalizations (e.g., "wow!", "huh?", "umm") and significant pauses (represented as '...').
3.  Translate this transcription into ${fullLanguageName} (language code: ${targetLanguageCode}). The translation should be natural, accurate, and reflect the nuances of any transcribed vocalizations.
4.  Present the final translated text in ${fullLanguageName} (language code: ${targetLanguageCode}) formatted with timestamps. Each timestamped segment MUST target a duration of 10 seconds. For instance, segments should be [00:00:00 - 00:00:10], then [00:00:10 - 00:00:20], and so on. Adjust segments slightly to align with natural speech pauses if they occur very close to a 10-second mark, but the primary goal is 10-second intervals. Avoid segments that are significantly shorter (e.g., 1-3 seconds) unless it's the very end of the audio. Critically, segments should NOT be excessively long, such as 30 seconds or 1 minute, unless the entire audio clip is shorter than that and consists of a single continuous utterance. Strive for consistent 10-second segmentation throughout the audio.
    The format for each line must be: [HH:MM:SS - HH:MM:SS] The translated text for this segment in ${fullLanguageName}.
    For example, if target language is ${fullLanguageName}:
    [00:00:00 - 00:00:10] (This would be the translated text for the first 10 seconds in ${fullLanguageName})
    [00:00:10 - 00:00:20] (This would be the translated text for the next 10 seconds in ${fullLanguageName})
5.  CRITICAL: Your entire response must be ONLY in ${fullLanguageName} (language code: ${targetLanguageCode}). No other languages, including English, should appear in your output.
6.  Do not include any introductory text, concluding remarks, or the original language transcription. Your response should contain only the lines of timestamped translations in ${fullLanguageName}.`;

  try {
    const audioContentPart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType,
      },
    };

    const instructionTextPart = {
      text: promptText,
    };

    const contents = [{ parts: [instructionTextPart, audioContentPart] }];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: contents,
      config: {
        systemInstruction: systemInstructionText,
      }
    });

    const transcription = response.text;
    if (transcription === undefined || transcription === null || typeof transcription !== 'string') {
      if (response.candidates && response.candidates[0] && response.candidates[0].finishReason !== 'STOP') {
        const reason = response.candidates[0].finishReason;
        const safetyRatings = response.candidates[0].safetyRatings;
        console.warn(`Transcription may be incomplete or blocked. Reason: ${reason}`, safetyRatings);
        return { text: "", error: `Transcription failed or content was blocked. Reason: ${reason}. Please check content safety guidelines.` };
      }
      return { text: "", error: `Received no valid text from the API. The model might not have understood the request, the audio was silent/unintelligible, or the translation to ${fullLanguageName} (language code: ${targetLanguageCode}) failed.` };
    }
    return { text: transcription };

  } catch (error) {
    console.error(`Error transcribing content to ${fullLanguageName} (language code: ${targetLanguageCode}) with Gemini:`, error);
    let errorMessage = `Failed to transcribe content to ${fullLanguageName}.`;
    const typedError = error;
    if (typedError && typedError.message) {
        errorMessage = `Gemini API Error: ${typedError.message}`;
        if (typedError.message.includes("DEADLINE_EXCEEDED")) {
            errorMessage = "The request to the AI model timed out. The file might be too large or complex. Please try with a smaller file or shorter recording.";
        } else if (typedError.message.includes("400")) {
            errorMessage = "The request was malformed (Bad Request). This could be due to an unsupported file type/format, data issue, or unsupported language/parameter. Please check the console.";
        } else if (typedError.message.toLowerCase().includes("api key not valid") || typedError.message.toLowerCase().includes("permission_denied")) {
            errorMessage = "Invalid API Key or Permission Denied. Please ensure your API_KEY is correctly configured, valid, and has the necessary permissions for the Gemini API.";
        } else if (typedError.message.includes("Vertex AI API has not been used in project") || typedError.message.includes("project has not enabled") || typedError.message.includes("service is not available")) {
            errorMessage = "API not enabled or service unavailable. Please ensure the Generative Language API (or Vertex AI API) is enabled in your Google Cloud project and billing is configured."
        }
    } else if (typeof error === 'string') {
        errorMessage += ` Details: ${error}`;
    }

    return { text: "", error: errorMessage };
  }
};

export const translateText = async (
  textToTranslate,
  sourceLanguageCode,
  targetLanguageCode
) => {
  if (!ai) {
     return { text: "", error: "Gemini API client is not initialized. This usually means the API_KEY is missing, invalid, or was not correctly set in services/geminiService.js. Please check your setup and the browser console for more details." };
  }
  resetChatSession();

  const targetLanguageObj = LANGUAGES.find(lang => lang.code === targetLanguageCode);
  const targetLanguageName = targetLanguageObj ? targetLanguageObj.name : targetLanguageCode;

  const systemInstructionText = `You are an expert translation assistant with a knack for human-like, natural language. Your mission is to provide translations that are not just accurate, but also feel completely natural, fluent, and human-sounding in the target language (${targetLanguageName}, language code: ${targetLanguageCode}). Imagine you're explaining this to a friend in ${targetLanguageName} – that's the tone and style to aim for.
Actively avoid stiffness, overly formal language, or direct literal translations that sound robotic or don't capture the true idiomatic meaning. If a literal translation is awkward, rephrase the sentence or choose different vocabulary to enhance its naturalness and flow in ${targetLanguageName} (language code: ${targetLanguageCode}), while faithfully preserving the original message's intent.
The priority is a translation that reads or sounds like it was originally crafted by a native ${targetLanguageName} (language code: ${targetLanguageCode}) speaker, conveying the meaning with a human touch. Your final output must be strictly in the language specified by the code '${targetLanguageCode}' (${targetLanguageName}).`;

  let promptText = "";

  if (sourceLanguageCode === "auto") {
    promptText = `Detect the language of the following text and then translate it into the language specified by the code '${targetLanguageCode}' (${targetLanguageName}).
The translation must be exceptionally natural, fluent, and idiomatic in '${targetLanguageCode}' (${targetLanguageName}), capturing the original's intent perfectly.
Return *only* the translated text in the language specified by the code '${targetLanguageCode}' (${targetLanguageName}). Do not include any other explanatory text, introduction, or the original language text. It is absolutely critical that your entire response, including all text, is SOLELY in ${targetLanguageName} (language code: ${targetLanguageCode}). Do not use English or any language other than ${targetLanguageName} (language code: ${targetLanguageCode}) in your output.

Text to translate:
"${textToTranslate}"`;
  } else {
    const sourceLanguageObj = LANGUAGES.find(lang => lang.code === sourceLanguageCode);
    const sourceLanguageName = sourceLanguageObj ? sourceLanguageObj.name : sourceLanguageCode;
    promptText = `Translate the following text from ${sourceLanguageName} (language code: ${sourceLanguageCode}) into the language specified by the code '${targetLanguageCode}' (${targetLanguageName}).
The translation must be exceptionally natural, fluent, and idiomatic in '${targetLanguageCode}' (${targetLanguageName}), capturing the original's intent perfectly.
Return *only* the translated text in the language specified by the code '${targetLanguageCode}' (${targetLanguageName}). Do not include any other explanatory text, introduction, or the original language text. It is absolutely critical that your entire response, including all text, is SOLELY in ${targetLanguageName} (language code: ${targetLanguageCode}). Do not use English or any language other than ${targetLanguageName} (language code: ${targetLanguageCode}) in your output.

Text to translate:
"${textToTranslate}"`;
  }

  try {
    const textPart = { text: promptText };
    const contents = [{ parts: [textPart] }];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: contents,
      config: {
        systemInstruction: systemInstructionText,
      }
    });

    const translation = response.text;
    if (translation === undefined || translation === null || typeof translation !== 'string') {
       return { text: "", error: `Received no valid text from the API for translation to ${targetLanguageName} (language code: ${targetLanguageCode}). The model might not have understood the request or the translation failed.` };
    }
    return { text: translation };

  } catch (error) {
    console.error(`Error translating text to ${targetLanguageName} (language code: ${targetLanguageCode}) with Gemini:`, error);
    let errorMessage = `Failed to translate text to ${targetLanguageName}.`;
    const typedError = error;
     if (typedError && typedError.message) {
        errorMessage = `Gemini API Error: ${typedError.message}`;
         if (typedError.message.toLowerCase().includes("api key not valid") || typedError.message.toLowerCase().includes("permission_denied")) {
            errorMessage = "Invalid API Key or Permission Denied. Please ensure your API_KEY is correctly configured and valid.";
        }
    } else if (typeof error === 'string') {
        errorMessage += ` Details: ${error}`;
    }
    return { text: "", error: errorMessage };
  }
};

export const getOrInitializeChat = async (targetLanguageCode) => {
  if (!ai) {
    console.error("Gemini API client not initialized for chat. Check API_KEY in services/geminiService.js and browser console for errors.");
    return false;
  }
  if (chatInstance && currentChatLanguage === targetLanguageCode) {
    return true;
  }

  const languageObj = LANGUAGES.find(lang => lang.code === targetLanguageCode);
  const targetLanguageName = languageObj ? languageObj.name : targetLanguageCode;

  const systemInstruction = `You are a helpful and versatile AI assistant.
Your primary goal is to respond in ${targetLanguageName} (language code: ${targetLanguageCode}).
If the user's query implies a different language or context, adapt naturally, but prioritize responding in ${targetLanguageName} (language code: ${targetLanguageCode}) unless explicitly asked to use another language for a specific response.
Be friendly, concise, and informative. Strive for responses that sound human and conversational in ${targetLanguageName} (language code: ${targetLanguageCode}).`;

  try {
    chatInstance = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: systemInstruction,
      },
    });
    currentChatLanguage = targetLanguageCode;
    console.log(`Chat initialized/re-initialized for ${targetLanguageName} (language code: ${targetLanguageCode})`);
    return true;
  } catch (error) {
    console.error(`Error initializing chat session for ${targetLanguageName} (language code: ${targetLanguageCode}):`, error);
     let errorMessage = `Failed to initialize chat session for ${targetLanguageName}.`;
     const typedError = error;
     if (typedError && typedError.message) {
        if (typedError.message.toLowerCase().includes("api key not valid") || typedError.message.toLowerCase().includes("permission_denied")) {
            errorMessage = `Invalid API Key or Permission Denied for chat initialization. Check API_KEY in services/geminiService.js for ${targetLanguageName}.`;
        } else {
            errorMessage = `Chat Init Error for ${targetLanguageName}: ${typedError.message}`;
        }
     }
    console.error(errorMessage);
    chatInstance = null;
    currentChatLanguage = null;
    return false;
  }
};

export const sendChatMessage = async (
  message,
  targetLanguageCode
) => {
  if (!ai) {
    return { text: "", error: "Gemini API client is not initialized. Check API_KEY in services/geminiService.js and browser console for errors." };
  }

  const chatInitialized = await getOrInitializeChat(targetLanguageCode);
  const languageObj = LANGUAGES.find(lang => lang.code === targetLanguageCode);
  const targetLanguageName = languageObj ? languageObj.name : targetLanguageCode;

  if (!chatInstance || !chatInitialized) {
    return { text: "", error: `Chat session is not initialized or failed to initialize for ${targetLanguageName} (language code: ${targetLanguageCode}). Please check API Key (in services/geminiService.js) and language selection. See browser console for more details.` };
  }

  try {
    const response = await chatInstance.sendMessage({ message });
    const chatResponseText = response.text;
    if (chatResponseText === undefined || chatResponseText === null || typeof chatResponseText !== 'string') {
      return { text: "", error: `Received an empty or invalid response from the AI for chat in ${targetLanguageName} (language code: ${targetLanguageCode}).` };
    }
    return { text: chatResponseText };
  } catch (error) {
    console.error(`Error sending chat message with Gemini for ${targetLanguageName} (language code: ${targetLanguageCode}):`, error);
    let errorMessage = `Failed to get a response from the AI in ${targetLanguageName}.`;
    const typedError = error;
     if (typedError && typedError.message) {
        errorMessage = `Gemini API Error: ${typedError.message}`;
         if (typedError.message.toLowerCase().includes("api key not valid") || typedError.message.toLowerCase().includes("permission_denied")) {
            errorMessage = `Invalid API Key or Permission Denied for chat message in ${targetLanguageName}. Check API_KEY in services/geminiService.js.`;
        }
    } else if (typeof error === 'string') {
        errorMessage += ` Details: ${error}`;
    }
    return { text: "", error: errorMessage };
  }
};

export const resetChatSession = () => {
  chatInstance = null;
  currentChatLanguage = null;
  console.log("Chat session reset.");
};
