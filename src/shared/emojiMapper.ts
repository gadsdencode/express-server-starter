// shared/emojiMapper.ts

export const emojiMap: { [key: string]: string } = {
    "emoji_heart": "❤️",
    "emoji_thumbsup": "👍",
    "emoji_smile": "😊",
    // Add more emojis as needed
  };
  
  export const getEmoji = (id: string): string => {
    return emojiMap[id] || '❓'; // Fallback to a question mark if no mapping found
};
  
  export const getEmojiId = (emoji: string): string => {
    const entry = Object.entries(emojiMap).find(([_, value]) => value === emoji);
    return entry ? entry[0] : emoji;
  };