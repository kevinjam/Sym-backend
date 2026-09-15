'use strict';

/**
 * Sym-authored daily wellness insights (not scraped from third-party medical sites).
 * Categories follow backend/.cursor_guide.
 */
module.exports = [
  {
    slug: 'eat-the-rainbow',
    category: 'diet_nutrition',
    tag: 'Nutrition',
    title: 'Eat the Rainbow Daily',
    hook: "Your plate's color palette is a direct window into your nutrient intake.",
    why:
      'Different pigments in plants — from the lycopene in red tomatoes to the anthocyanins in purple berries — each support different systems. No single color covers everything.',
    sections: [
      {
        label: 'The science',
        body:
          'People who regularly eat several plant color groups tend to get a broader mix of antioxidants and fiber than those whose plates stay beige.',
      },
      {
        label: 'What this means for you',
        body:
          'If meals are mostly pasta, bread, and pale proteins, you may be missing pigments that support everyday cellular defense.',
      },
      {
        label: "Today's action",
        body:
          'Add one new color at your next meal — spinach, cherry tomatoes, or half an avocado all count.',
      },
    ],
    tip: 'Prep a small rainbow bowl on Sunday so the habit is ready all week.',
    imageUrl:
      'https://images.unsplash.com/photo-1644704170910-a0cdf183649b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=75',
    detailImageUrl:
      'https://images.unsplash.com/photo-1644704170910-a0cdf183649b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=600&q=80',
    fallbackColors: ['#C8D6E8', '#A0B6D6'],
    weight: 10,
  },
  {
    slug: 'sleep-brain-restore',
    category: 'healthy_living',
    tag: 'Sleep Science',
    title: '7–9 Hours of Sleep Restores the Brain',
    hook: "Sleep isn't downtime — it's your brain's mandatory maintenance window.",
    why:
      'During deep sleep, your brain clears metabolic waste and consolidates memory. Short nights leave that cleanup unfinished.',
    sections: [
      {
        label: 'What happens at each stage',
        body:
          'Light sleep supports memory. Deep sleep supports recovery. REM supports emotion and creativity. You need all three most nights.',
      },
      {
        label: 'The hidden cost of 6 hours',
        body:
          'Even a week of short sleep can blunt focus and mood — often before you notice how drained you feel.',
      },
      {
        label: "Tonight's action",
        body:
          'Set a wind-down alarm 45 minutes before bed. Dim lights and put the phone face-down.',
      },
    ],
    tip: 'A cool room (about 18–20°C / 65–68°F) helps deep sleep arrive faster.',
    imageUrl:
      'https://images.unsplash.com/photo-1758273239288-9b60777397c5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=75',
    detailImageUrl:
      'https://images.unsplash.com/photo-1758273239288-9b60777397c5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=600&q=80',
    fallbackColors: ['#BED0E4', '#9BB2D2'],
    weight: 10,
  },
  {
    slug: 'mediterranean-heart-habits',
    category: 'heart_prevention',
    tag: 'Preventive Health',
    title: 'Heart-Healthy Eating Patterns',
    hook: "This isn't a strict diet — it's a flexible pattern built around whole foods.",
    why:
      'Eating patterns rich in olive oil, legumes, whole grains, fish, nuts, and vegetables are linked with better long-term heart health markers.',
    sections: [
      {
        label: 'The core of it',
        body:
          'Favor plants, healthy fats, and seafood over ultra-processed snacks. Abundance of the right foods beats harsh restriction.',
      },
      {
        label: 'Why habits matter',
        body:
          'Polyphenols, fiber, and omega-3s support healthy blood pressure and inflammation balance when practiced consistently.',
      },
      {
        label: 'Your first step',
        body:
          'Swap one processed snack today for a small handful of walnuts or almonds.',
      },
    ],
    tip: 'Drizzle olive oil on vegetables — a high-impact everyday swap.',
    imageUrl:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=75',
    detailImageUrl:
      'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=600&q=80',
    fallbackColors: ['#C8D6E8', '#D8E4F0', '#EAF0F8'],
    weight: 9,
  },
  {
    slug: 'morning-sunlight',
    category: 'general_health',
    tag: 'Wellness',
    title: 'Morning Sunlight Boosts Vitamin D',
    hook: 'Ten minutes of morning sun can do more for energy than most supplements.',
    why:
      'Morning light anchors your circadian rhythm, supports a healthy cortisol rise, and helps your skin start vitamin D synthesis.',
    sections: [
      {
        label: 'The cortisol connection',
        body:
          'Light within about an hour of waking helps set daytime alertness. Miss that window and energy often feels flat.',
      },
      {
        label: 'Vitamin D basics',
        body:
          'Many adults get less sunlight than they need. Short outdoor exposure is a simple lifestyle lever when safe for your skin type and climate.',
      },
      {
        label: 'What to do',
        body:
          'Step outside within an hour of waking for 10–15 minutes. Even cloudy days still help circadian timing.',
      },
    ],
    tip: 'Pair morning light with a short walk for movement and stress relief in one habit.',
    imageUrl:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=75',
    detailImageUrl:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=600&q=80',
    fallbackColors: ['#C4D2E6', '#D4E0EE', '#E4EDF6', '#F0F5FA'],
    weight: 10,
  },
  {
    slug: 'hydrate-before-meals',
    category: 'weight_management',
    tag: 'Hydration',
    title: 'Hydrate Before Meals to Reduce Overeating',
    hook: 'Your brain regularly confuses thirst for hunger. One glass can change everything.',
    why:
      'Drinking water before meals can support earlier fullness cues and steadier portions — a sustainable habit, not a crash diet.',
    sections: [
      {
        label: 'How it works',
        body:
          'Water can slightly stretch the stomach and slow the pace of eating, so you notice fullness sooner.',
      },
      {
        label: 'The dehydration trap',
        body:
          'Mild dehydration often shows up as fatigue or snack cravings — symptoms people sometimes treat with food instead of water.',
      },
      {
        label: 'Make it automatic',
        body:
          'Leave a full glass by your phone charger at night. Drink it on waking, then again before each meal.',
      },
    ],
    tip: 'Add lemon or a pinch of salt if it helps you drink more consistently.',
    imageUrl:
      'https://images.unsplash.com/photo-1548832633-3c8f8a4b4e1a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=400&q=75',
    detailImageUrl:
      'https://images.unsplash.com/photo-1548832633-3c8f8a4b4e1a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=600&q=80',
    fallbackColors: ['#C6D4E8', '#D6E2F0', '#E8EFF8'],
    weight: 9,
  },
  {
    slug: 'two-minute-reset',
    category: 'mindfulness_wellbeing',
    tag: 'Mindfulness',
    title: 'A Two-Minute Breath Reset',
    hook: 'You do not need a long meditation to change how your nervous system feels.',
    why:
      'Slow exhale-focused breathing can dial down stress arousal and make the next decision easier — whether that is sleep, a walk, or a calmer meal.',
    sections: [
      {
        label: 'Try this',
        body:
          'Inhale for 4 counts, exhale for 6–8 counts. Repeat for two minutes. Longer exhales nudge the body toward rest-and-digest.',
      },
      {
        label: 'When to use it',
        body:
          'Before stressful meetings, after scrolling, or when you notice your shoulders climbing toward your ears.',
      },
      {
        label: 'Keep it light',
        body:
          'This is a wellbeing tool for everyday stress — not a treatment for mental health conditions. Seek professional care when you need it.',
      },
    ],
    tip: 'Park the habit after brushing your teeth so it rides on an existing routine.',
    fallbackColors: ['#D0DCEC', '#B8C8DC'],
    weight: 8,
  },
  {
    slug: 'mobility-microbreaks',
    category: 'mobility_muscles',
    tag: 'Mobility',
    title: 'Microbreaks Beat Marathon Stretching',
    hook: 'Three minutes every hour often beats one heroic stretch at night.',
    why:
      'Long sitting stiffens hips and upper back. Brief movement snacks keep joints happier and energy more even.',
    sections: [
      {
        label: 'A simple circuit',
        body:
          'Stand, roll shoulders, open the chest, then do 8 slow hip hinges or bodyweight squats. Finish with a gentle neck turn left and right.',
      },
      {
        label: 'Posture without perfection',
        body:
          'Aim for frequent position changes, not a permanently “perfect” desk pose.',
      },
      {
        label: "Today's action",
        body:
          'Set an hourly chime. When it rings, stand and move for 90 seconds.',
      },
    ],
    tip: 'Keep shoes nearby so a short hallway walk feels automatic.',
    fallbackColors: ['#C9D7E9', '#A8BCD6'],
    weight: 8,
  },
  {
    slug: 'fiber-friendly-gut',
    category: 'digestive_wellness',
    tag: 'Gut Habits',
    title: 'Build Fiber Up Gradually',
    hook: 'Gut-friendly eating works best when fiber rises slowly, not overnight.',
    why:
      'Fiber feeds beneficial gut microbes and supports regularity. Jumping too fast can cause bloating — pace matters.',
    sections: [
      {
        label: 'Easy adds',
        body:
          'Oats, berries, beans, chia, and leafy greens are simple ways to increase plant fiber without overhauling every meal.',
      },
      {
        label: 'Pair with water',
        body:
          'As fiber goes up, hydration should too — it helps fiber do its job comfortably.',
      },
      {
        label: 'One plate rule',
        body:
          'Add one extra vegetable serving today. Consistency beats a perfect “gut detox.”',
      },
    ],
    tip: 'If beans bother you, start with a few spoonfuls and rinse canned beans well.',
    fallbackColors: ['#CEE0D4', '#A8C4B0'],
    weight: 8,
  },
  {
    slug: 'evening-screen-dim',
    category: 'healthy_living',
    tag: 'Sleep Habits',
    title: 'Dim Screens Before Bed',
    hook: 'Bright screens late at night tell your brain it is still daytime.',
    why:
      'Evening light can delay melatonin timing and push bedtime later — even when you feel “tired but wired.”',
    sections: [
      {
        label: 'A practical cutoff',
        body:
          'Aim to dim screens or switch to warmer night modes 45–60 minutes before sleep.',
      },
      {
        label: 'Replace, don’t just remove',
        body:
          'Swap scrolling for a paper book, light stretch, or journaling so the habit sticks.',
      },
      {
        label: 'Bedroom cue',
        body:
          'Charge the phone outside the bedroom if possible. Friction helps.',
      },
    ],
    tip: 'Use a physical alarm clock so the phone stays out of reach overnight.',
    fallbackColors: ['#B8C6DC', '#8FA3C4'],
    weight: 8,
  },
  {
    slug: 'protein-at-breakfast',
    category: 'diet_nutrition',
    tag: 'Nutrition',
    title: 'Protein Anchors Your Morning',
    hook: 'A protein-forward breakfast steadies energy better than a sugar spike.',
    why:
      'Protein and fiber slow digestion, which can reduce mid-morning crashes and snack hunting.',
    sections: [
      {
        label: 'Simple builds',
        body:
          'Eggs, Greek yogurt, tofu scramble, leftover lentils, or a protein smoothie with fruit all work.',
      },
      {
        label: 'What to watch',
        body:
          'Pastries alone often leave you hungry again by 10 a.m. Pair carbs with protein when you can.',
      },
      {
        label: "Today's action",
        body:
          'Add one palm-sized protein source to breakfast.',
      },
    ],
    tip: 'Prep overnight oats with yogurt tonight for a grab-and-go morning.',
    fallbackColors: ['#E8D5C4', '#D4B89A'],
    weight: 7,
  },
  {
    slug: 'walk-after-meals',
    category: 'general_health',
    tag: 'Movement',
    title: 'A 10-Minute Walk After Meals',
    hook: 'Light movement after eating is one of the highest-ROI wellness habits.',
    why:
      'A short walk supports digestion comfort and post-meal energy steadiness without needing a full workout.',
    sections: [
      {
        label: 'Keep it gentle',
        body:
          'Easy pace is enough. This is about circulation and rhythm, not intensity.',
      },
      {
        label: 'Stack the habit',
        body:
          'Walk while you take a call, listen to a podcast, or tidy after dinner.',
      },
      {
        label: 'Start small',
        body:
          'Commit to one post-meal walk today — lunch or dinner.',
      },
    ],
    tip: 'Leave walking shoes by the door so the habit has zero setup cost.',
    fallbackColors: ['#C8DCC8', '#A0C0A0'],
    weight: 9,
  },
  {
    slug: 'stress-label-it',
    category: 'mindfulness_wellbeing',
    tag: 'Emotional Wellbeing',
    title: 'Name the Feeling, Shrink the Spiral',
    hook: 'Putting a simple label on stress often reduces its volume.',
    why:
      'Noticing “I’m tense” or “I’m overloaded” creates a pause between trigger and reaction — useful for everyday emotional wellbeing.',
    sections: [
      {
        label: 'Try a three-word check-in',
        body:
          'Once today, silently name: body sensation, emotion, need (e.g. tight chest / anxious / need a break).',
      },
      {
        label: 'Then choose one tiny action',
        body:
          'Drink water, step outside, or message a friend. Action closes the loop.',
      },
      {
        label: 'Know the boundary',
        body:
          'Persistent low mood, panic, or distress deserves professional support. Sym insights are wellness education, not therapy.',
      },
    ],
    tip: 'Put a sticky note on your laptop: “Name it → one tiny step.”',
    fallbackColors: ['#D8D0E8', '#B8A8D0'],
    weight: 7,
  },
];
