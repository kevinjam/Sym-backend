'use strict';

/**
 * Default curated mindfulness bookshelf (matches React `MIND_BOOKS` + extras).
 * Upserted by `bookId` so re-running the seed refreshes copy without duplicates.
 */
module.exports = [
  {
    bookId: 'atomic-habits',
    title: 'Atomic Habits',
    author: 'James Clear',
    topic: 'Habits',
    difficulty: 'beginner',
    readingTimeMinutes: 320,
    summary:
      'This book provides a comprehensive guide on how tiny changes can lead to remarkable results. Clear breaks down the process of habit formation and offers practical strategies to build good habits and break bad ones.',
    whyRecommended:
      "It's a foundational text on the topic, offering actionable insights and relatable examples.",
    keyLessons: [
      'The power of 1% improvements.',
      'The importance of identity in habit formation.',
      'How to design your environment for success.',
      'The role of systems over goals.',
      'Strategies for overcoming obstacles.',
    ],
    mindfulnessInsight:
      'Embrace the journey of small changes, allowing each step to unfold at its own pace.',
    concepts: ['habits', 'behavior change', 'self-improvement', 'mindfulness', 'productivity'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',
    isbn: '9780735211292',
    sortOrder: 10,
    published: true,
  },
  {
    bookId: 'power-of-habit',
    title: 'The Power of Habit',
    author: 'Charles Duhigg',
    topic: 'Habits',
    difficulty: 'intermediate',
    readingTimeMinutes: 520,
    summary:
      'Duhigg explores the science behind why habits exist and how they can be changed. Through engaging stories and cutting-edge research, he reveals the mechanisms at the core of habits.',
    whyRecommended:
      'Blends neuroscience with real-world stories, making complex science easy to apply.',
    keyLessons: [
      'The habit loop: cue, routine, reward.',
      'Keystone habits that drive change.',
      'How organizations build habits.',
      'Willpower as a habit.',
      'How to reshape habits using the golden rule.',
    ],
    mindfulnessInsight:
      'Notice the cue before the routine — awareness is the first gentle step toward change.',
    concepts: ['habit loop', 'neuroscience', 'behavior', 'willpower', 'change'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781400069286-L.jpg',
    isbn: '9781400069286',
    sortOrder: 20,
    published: true,
  },
  {
    bookId: 'deep-work',
    title: 'Deep Work',
    author: 'Cal Newport',
    topic: 'Focus',
    difficulty: 'intermediate',
    readingTimeMinutes: 375,
    summary:
      'Newport argues that the ability to focus without distraction on cognitively demanding tasks is becoming increasingly rare and valuable in our economy.',
    whyRecommended:
      'Essential for anyone who wants to produce meaningful, high-quality work in a distracted world.',
    keyLessons: [
      'Deep work is rare and valuable.',
      'The 4 disciplines of execution.',
      'How to schedule deep work sessions.',
      'Drain the shallows.',
      'Quit social media deliberately.',
    ],
    mindfulnessInsight:
      'Protect attention like breath in meditation — fewer tabs, deeper presence.',
    concepts: ['focus', 'productivity', 'flow state', 'digital minimalism', 'mastery'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781455586691-L.jpg',
    isbn: '9781455586691',
    sortOrder: 30,
    published: true,
  },
  {
    bookId: 'miracle-morning',
    title: 'The Miracle Morning',
    author: 'Hal Elrod',
    topic: 'Morning Routine',
    difficulty: 'beginner',
    readingTimeMinutes: 270,
    summary:
      'Elrod shares a morning routine called SAVERS — Silence, Affirmations, Visualization, Exercise, Reading, Scribing — designed to transform your life before 8am.',
    whyRecommended:
      'Simple, practical, and immediately actionable. A great starting point for a morning practice.',
    keyLessons: [
      'Silence and meditation to start the day.',
      'Affirmations reprogram your mindset.',
      'Visualization primes for success.',
      'Movement energises the mind.',
      'Reading and journaling build knowledge.',
    ],
    mindfulnessInsight:
      'A short morning ritual can anchor the day more gently than rushing into screens.',
    concepts: ['morning routine', 'meditation', 'affirmations', 'habits', 'mindfulness'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9780979019777-L.jpg',
    isbn: '9780979019777',
    sortOrder: 40,
    published: true,
  },
  {
    bookId: 'why-we-sleep',
    title: 'Why We Sleep',
    author: 'Matthew Walker',
    topic: 'Sleep',
    difficulty: 'intermediate',
    readingTimeMinutes: 420,
    summary:
      'A clear, science-backed exploration of why sleep is essential for mood, immunity, memory, and metabolic health — and what happens when we chronically cut it short.',
    whyRecommended:
      'Pairs perfectly with Sym calm practices: understanding sleep science motivates better wind-down habits.',
    keyLessons: [
      'Sleep is not optional recovery — it is active restoration.',
      'Consistency of schedule matters as much as duration.',
      'Caffeine and alcohol disrupt deep sleep stages.',
      'Light exposure shapes circadian rhythm.',
      'Naps can help — or hurt — depending on timing.',
    ],
    mindfulnessInsight:
      'Treat bedtime as a gentle practice, not a deadline you race toward.',
    concepts: ['sleep', 'circadian rhythm', 'recovery', 'health', 'rest'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781501144318-L.jpg',
    isbn: '9781501144318',
    sortOrder: 50,
    published: true,
  },
  {
    bookId: 'untethered-soul',
    title: 'The Untethered Soul',
    author: 'Michael A. Singer',
    topic: 'Mindfulness',
    difficulty: 'beginner',
    readingTimeMinutes: 300,
    summary:
      'Singer invites readers to observe the inner voice, release stuck energy, and rest as the awareness behind thoughts — a practical companion to daily mindfulness.',
    whyRecommended:
      'Accessible spiritual psychology that complements grounding and breathing practices.',
    keyLessons: [
      'You are the witness of thoughts, not the thoughts themselves.',
      'Resistance keeps pain looping.',
      'Openness softens emotional energy.',
      'Death awareness clarifies priorities.',
      ' unconditional happiness is a practice of letting go.',
    ],
    mindfulnessInsight:
      'When thoughts surge, label “thinking” and return to the seat of awareness.',
    concepts: ['awareness', 'presence', 'letting go', 'meditation', 'inner peace'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781572245372-L.jpg',
    isbn: '9781572245372',
    sortOrder: 60,
    published: true,
  },
  {
    bookId: 'wherever-you-go',
    title: 'Wherever You Go, There You Are',
    author: 'Jon Kabat-Zinn',
    topic: 'Mindfulness',
    difficulty: 'beginner',
    readingTimeMinutes: 240,
    summary:
      'A classic introduction to mindfulness meditation — short chapters on presence, breath, and bringing awareness into ordinary moments.',
    whyRecommended:
      'The foundational mindfulness text many clinicians and teachers still recommend first.',
    keyLessons: [
      'Mindfulness is paying attention on purpose.',
      'The breath is always available as an anchor.',
      'Formal practice supports informal awareness.',
      'Non-judging softens struggle.',
      'Ordinary moments are the curriculum.',
    ],
    mindfulnessInsight:
      'You do not need a perfect cushion — one mindful breath is already practice.',
    concepts: ['mindfulness', 'meditation', 'MBSR', 'presence', 'breath'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781401307783-L.jpg',
    isbn: '9781401307783',
    sortOrder: 70,
    published: true,
  },
  {
    bookId: 'grit',
    title: 'Grit',
    author: 'Angela Duckworth',
    topic: 'Resilience',
    difficulty: 'intermediate',
    readingTimeMinutes: 360,
    summary:
      'Duckworth shows how passion and perseverance — grit — often predict achievement better than talent alone, with research from classrooms to elite performers.',
    whyRecommended:
      'Useful when building long-term wellness habits: consistency beats intensity spikes.',
    keyLessons: [
      'Effort counts twice.',
      'Interest deepens into passion over time.',
      'Practice must be deliberate.',
      'Purpose sustains perseverance.',
      'Hope is a habit of returning after setbacks.',
    ],
    mindfulnessInsight:
      'Celebrate showing up again — resilience is returning, not never falling.',
    concepts: ['resilience', 'perseverance', 'growth', 'habits', 'motivation'],
    coverUrl: 'https://covers.openlibrary.org/b/isbn/9781501111105-L.jpg',
    isbn: '9781501111105',
    sortOrder: 80,
    published: true,
  },
];
