"use strict";
// A hand-curated, verified set of motivational quotes from great Indian
// personalities — spanning the freedom struggle, science, sport, literature,
// spirituality, and public service. Used by generateDailyBriefing in index.ts:
// selection there is deterministic (day-of-year modulo this list), and
// Gemini's only job with an entry is translating `textEn` into Kannada — it
// never invents the quote or its attribution, so there's no
// misattribution/hallucination risk on the fact itself.
//
// `scene` is a short visual hint used to build the day's background-image
// prompt (same role as TAB_HEADER_SCENES in index.ts) — keep it concrete and
// distinct from other entries so consecutive days don't look alike.
Object.defineProperty(exports, "__esModule", { value: true });
exports.INDIAN_QUOTES = void 0;
exports.INDIAN_QUOTES = [
    { textEn: 'Be the change that you wish to see in the world.', author: 'Mahatma Gandhi', theme: 'change', scene: 'a simple charkha (spinning wheel) resting in warm morning light' },
    { textEn: 'Arise, awake, and stop not till the goal is reached.', author: 'Swami Vivekananda', theme: 'perseverance', scene: 'a lone monk gazing at a sunrise over distant Himalayan peaks' },
    { textEn: 'Dream is not that which you see while sleeping, it is something that does not let you sleep.', author: 'A. P. J. Abdul Kalam', theme: 'ambition', scene: 'a rocket launch pad at dawn with a stack of books nearby' },
    { textEn: "You can't cross the sea merely by standing and staring at the water.", author: 'Rabindranath Tagore', theme: 'courage', scene: 'a small wooden boat setting out onto a calm river at sunrise' },
    { textEn: 'The path from dreams to success does exist.', author: 'Kalpana Chawla', theme: 'ambition', scene: 'a rocket launching into a starry night sky' },
    { textEn: 'Manpower without unity is not a strength unless it is combined with brotherhood.', author: 'Sardar Vallabhbhai Patel', theme: 'unity', scene: 'many hands joined together forming a circle in warm golden light' },
    { textEn: 'Ask the right questions, and nature will open the doors to her secrets.', author: 'C. V. Raman', theme: 'curiosity', scene: 'a scientist looking through a prism as light splits into colours' },
    { textEn: 'The power of imagination makes us infinite.', author: 'Sarojini Naidu', theme: 'imagination', scene: 'a figure standing beneath a vast starry sky with birds flying free' },
    { textEn: 'It is easy to kill individuals but you cannot kill ideas.', author: 'Bhagat Singh', theme: 'conviction', scene: 'a lit oil lamp glowing steadily against a strong wind' },
    { textEn: 'Go, get education. Be self-reliant, be industrious. Work, gather wisdom and riches — all this knowledge will bring you esteem.', author: 'Savitribai Phule', theme: 'education', scene: 'a young girl reading a book under a banyan tree with sunlight through the leaves' },
    { textEn: 'Educate, agitate, organize.', author: 'Dr. B. R. Ambedkar', theme: 'empowerment', scene: 'a group of students walking together toward a rising sun' },
    { textEn: 'Give me blood, and I shall give you freedom.', author: 'Subhas Chandra Bose', theme: 'sacrifice', scene: 'a tricolour flag waving against a dawn sky' },
    { textEn: 'Ask not what technology can do; ask what needs to be done and how technology can help.', author: 'Vikram Sarabhai', theme: 'purpose', scene: 'a satellite dish reaching toward a clear blue sky' },
    { textEn: 'I will not surrender my Jhansi.', author: 'Rani Lakshmibai', theme: 'resolve', scene: 'a fortress silhouette at sunset with a flag flying high above its ramparts' },
    { textEn: 'None can destroy iron, but its own rust can. Likewise, none can destroy a person, but his own mindset can.', author: 'J. R. D. Tata', theme: 'mindset', scene: 'an old anvil and hammer bathed in warm forge light' },
    { textEn: "If you can't feed a hundred people, then feed just one.", author: 'Mother Teresa', theme: 'service', scene: 'a warm bowl of food being shared between two open hands' },
    { textEn: "I don't believe in taking right decisions. I take decisions and then make them right.", author: 'Ratan Tata', theme: 'decisiveness', scene: 'a compass resting on an open notebook on a wooden desk' },
    { textEn: 'Our dreams have to be bigger. Our ambitions higher. Our commitment deeper. And our efforts greater.', author: 'Dhirubhai Ambani', theme: 'ambition', scene: 'a lone figure standing atop a hill overlooking a vast golden horizon' },
    { textEn: 'You cannot shake hands with a clenched fist.', author: 'Indira Gandhi', theme: 'peace', scene: 'two open hands reaching toward each other in soft warm light' },
    { textEn: 'The importance of a thing is not always in proportion to the noise it makes.', author: 'Jawaharlal Nehru', theme: 'substance', scene: 'a single lit candle glowing steadily in a quiet room' },
    { textEn: 'When you are inspired by some great purpose, all your thoughts break their bonds.', author: 'Patanjali', theme: 'purpose', scene: 'a figure seated in meditation at sunrise on a quiet hilltop' },
    { textEn: 'Education is the best friend. An educated person is respected everywhere.', author: 'Chanakya', theme: 'education', scene: 'an ancient palm-leaf manuscript beside a glowing oil lamp' },
    { textEn: 'All the powers in the universe are already ours. It is we who have put our hands before our eyes and cry that it is dark.', author: 'Swami Vivekananda', theme: 'self-belief', scene: 'cupped hands slowly opening to reveal a bright glowing light' },
    { textEn: 'Dreams give purpose to your vision and mission to your life.', author: 'Kiran Bedi', theme: 'purpose', scene: 'a young student looking up at an open sky filled with soaring birds' },
    { textEn: "You don't have to be in a boxing ring to be a fighter.", author: 'Mary Kom', theme: 'resilience', scene: 'a boxer training at dawn, silhouetted against a golden sky' },
    { textEn: 'Failure is a part of success. There is no such thing as a life without failure.', author: 'Sachin Tendulkar', theme: 'perseverance', scene: 'a cricket bat and ball resting on a sunlit pitch at dawn' },
    { textEn: 'There is no shortcut to success.', author: 'Milkha Singh', theme: 'hard work', scene: 'a lone runner on an empty track at sunrise' },
    { textEn: 'Do the best you can, and let go of the outcome.', author: 'Viswanathan Anand', theme: 'focus', scene: 'a chessboard mid-game bathed in warm lamplight' },
    { textEn: "You don't need a plan B because it distracts you from plan A.", author: 'M. S. Dhoni', theme: 'focus', scene: 'a cricket helmet and gloves resting on a bench facing an open stadium at dusk' },
    { textEn: "Success doesn't come overnight — it takes years of hard work and dedication.", author: 'P. V. Sindhu', theme: 'dedication', scene: 'a badminton racket and shuttlecock resting on a court at dawn' },
    { textEn: 'If you want to shine like a sun, first burn like a sun.', author: 'A. P. J. Abdul Kalam', theme: 'effort', scene: 'a bright sunrise breaking over distant mountain ridges' },
    { textEn: 'Clouds come floating into my life, no longer to carry rain or usher storm, but to add colour to my sunset sky.', author: 'Rabindranath Tagore', theme: 'gratitude', scene: 'colourful clouds drifting over a calm sunset horizon' },
    { textEn: 'Put your heart, mind, and soul into even your smallest acts. This is the secret of success.', author: 'Swami Sivananda', theme: 'dedication', scene: 'hands carefully shaping clay on a potter\'s wheel' },
    { textEn: "Real education is that which enables one to stand on one's own legs.", author: 'Vinoba Bhave', theme: 'self-reliance', scene: 'a young sapling growing tall from a small patch of sunlit soil' },
    { textEn: 'Every child has a right to a childhood.', author: 'Kailash Satyarthi', theme: 'hope', scene: 'children flying colourful kites under a bright open sky' },
    { textEn: 'Jai Jawan, Jai Kisan — hail the soldier, hail the farmer.', author: 'Lal Bahadur Shastri', theme: 'service', scene: 'a farmer and a soldier standing together in a golden wheat field at sunrise' },
];
//# sourceMappingURL=indianQuotes.js.map