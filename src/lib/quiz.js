// questionTypes: "both" | "meaning" | "reading"
// order: "shuffled" | "ordered"
export function buildQuizCards(subjects, { questionTypes = "both", order = "shuffled", random = Math.random } = {}) {
  const cards = [];
  subjects.forEach((s) => {
    if (questionTypes !== "reading") {
      cards.push({ id: `${s.id}:meaning`, subjectId: s.id, askType: "meaning" });
    }
    // Radicals and kana-only vocabulary have no reading to ask for.
    if (questionTypes !== "meaning" && s.readings.length > 0) {
      cards.push({ id: `${s.id}:reading`, subjectId: s.id, askType: "reading" });
    }
  });

  return order === "ordered" ? cards : shuffleSpread(cards, random);
}

// Fisher-Yates shuffle, then nudge the meaning and reading cards of the
// same subject apart so one doesn't give away the other.
function shuffleSpread(cards, random) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  const minGap = Math.min(3, Math.floor(cards.length / 2));
  const tooClose = (pos, subjectId) => {
    for (let back = 1; back <= minGap && pos - back >= 0; back++) {
      if (cards[pos - back].subjectId === subjectId) return true;
    }
    return false;
  };

  for (let i = 1; i < cards.length; i++) {
    if (!tooClose(i, cards[i].subjectId)) continue;
    for (let swapWith = i + 1; swapWith < cards.length; swapWith++) {
      if (!tooClose(i, cards[swapWith].subjectId)) {
        [cards[i], cards[swapWith]] = [cards[swapWith], cards[i]];
        break;
      }
    }
  }
  return cards;
}

// Put a missed card back into the queue a few cards later, so it comes up
// again before the session ends.
export function requeue(queue, position, card, random = Math.random) {
  const gap = 3 + Math.floor(random() * 6);
  const insertAt = Math.min(position + 1 + gap, queue.length);
  return [...queue.slice(0, insertAt), card, ...queue.slice(insertAt)];
}
