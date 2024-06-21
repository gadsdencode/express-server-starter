// /shared/emojiMapper.ts

export const emojiMap: { [key: string]: string } = {
    "emoji_heart": "❤️",
    "emoji_thumbsup": "👍",
    "emoji_smile": "😊",
    // Add more emojis as needed
};

export const getEmoji = (id: string): string => {
    return emojiMap[id] || '❓'; // Fallback to a question mark if no mapping found
};

export const getEmojiId = (emoji: string): string | null => {
    const entry = Object.entries(emojiMap).find(([_, value]) => value === emoji);
    return entry ? entry[0] : null;
};

export const isValidEmojiId = (id: string): boolean => {
    return Object.keys(emojiMap).includes(id);
};