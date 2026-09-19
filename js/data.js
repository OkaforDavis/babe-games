// Word banks + catalog of games shown on the homepage.

const WORD_BANKS = {
  food: [
    "jollof", "amala", "eba", "moimoi", "akara", "suya", "puffpuff",
    "efo riro", "egusi", "okra", "pepper soup", "fufu", "chin chin",
    "zobo", "kilishi", "dodo", "ofada", "nkwobi", "ewedu", "ogbono",
  ],
  animal: [
    "lion", "elephant", "tortoise", "crocodile", "goat", "parrot",
    "hyena", "antelope", "cricket", "lizard", "chameleon", "vulture",
  ],
  place: [
    "lagos", "abuja", "kano", "enugu", "ibadan", "calabar", "jos",
    "kaduna", "onitsha", "warri", "benin", "sokoto", "aba", "uyo",
  ],
  name: [
    "chidinma", "emeka", "folake", "bola", "ngozi", "tunde", "ifeoma",
    "kelechi", "amara", "seyi", "obinna", "yemi", "chiamaka", "dapo",
  ],
  thing: [
    "wrapper", "lantern", "bucket", "mortar", "calabash", "broom",
    "wheelbarrow", "umbrella", "basket", "slipper", "kettle",
  ],
};

const CATEGORY_LABELS = {
  food: "Food",
  animal: "Animal",
  place: "Place",
  name: "Name",
  thing: "Thing",
};

// Catalog shown on the homepage. type "internal" links to a page in this
// site, "soon" renders a disabled "coming soon" card.
const GAME_CATALOG = [
  {
    id: "scramble",
    title: "Word Scramble",
    emoji: "\u{1F520}",
    desc: "Pick a category and a word, it gets scrambled, your partner races the clock to unscramble it.",
    href: "games/scramble.html",
    status: "ready",
  },
  {
    id: "categories",
    title: "Name, Place, Animal, Thing (A-Z)",
    emoji: "\u{1F524}",
    desc: "Spin or pick a letter, then fill every category before the timer runs out.",
    href: "games/categories.html",
    status: "ready",
  },
  {
    id: "chain",
    title: "Chain Naming",
    emoji: "\u{1F517}",
    desc: "Call a food, animal or name, the next player must start with its last letter. Miss the beat, you're out.",
    href: "games/chain.html",
    status: "ready",
  },
  {
    id: "tenten",
    title: "Ten-Ten",
    emoji: "\u{1F9B6}",
    desc: "The classic hand-and-foot clapping elimination game, digitised with a rhythm prompt.",
    status: "soon",
  },
  {
    id: "suwe",
    title: "Suwe (Hopscotch)",
    emoji: "\u{1F4CF}",
    desc: "Draw the grid, hop the sequence. We'll add a tap-the-grid version for one device.",
    status: "soon",
  },
  {
    id: "ampe",
    title: "Ampe / Tumbling",
    emoji: "\u{1F938}",
    desc: "Jump-and-guess leg game, played in rounds with a reaction-based digital version.",
    status: "soon",
  },
  {
    id: "whot",
    title: "Whot!",
    emoji: "\u{1F0CF}",
    desc: "Nigeria's favourite card game, full rules engine coming soon.",
    status: "soon",
  },
  {
    id: "riddles",
    title: "Tan Mi Tan Mi (Riddles)",
    emoji: "❓",
    desc: "Call-and-response riddle game with a growing bank of traditional riddles.",
    status: "soon",
  },
  {
    id: "whoami",
    title: "Who Am I?",
    emoji: "\u{1F3AD}",
    desc: "Guess the Nigerian celebrity, food or place from yes/no clues.",
    status: "soon",
  },
  {
    id: "wouldyourather",
    title: "Would You Rather",
    emoji: "\u{1F914}",
    desc: "Local, funny, family-friendly dilemma cards for group play.",
    status: "soon",
  },
  {
    id: "storychain",
    title: "Story Chain",
    emoji: "\u{1F4D6}",
    desc: "Each player adds one line to a story started by the group, timed per turn.",
    status: "soon",
  },
];
