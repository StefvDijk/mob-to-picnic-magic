function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9%\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function computeCandidateScore(normalizedItem, candidate) {
  const queryTokens = tokenize(normalizedItem.normalizedQuery);
  const candidateTokens = tokenize(candidate.name);
  let score = 0;

  for (const token of queryTokens) {
    if (candidateTokens.includes(token)) {
      score += 1.5;
    } else if (candidate.name.toLowerCase().includes(token)) {
      score += 0.75;
    }
  }

  if (normalizedItem.attributes.variant) {
    const variantTokens = tokenize(normalizedItem.attributes.variant);
    for (const token of variantTokens) {
      if (candidateTokens.includes(token)) {
        score += 0.75;
      }
    }
  }

  if (normalizedItem.attributes.brand) {
    const brandToken = normalizedItem.attributes.brand.toLowerCase();
    if (candidate.brand && candidate.brand.toLowerCase().includes(brandToken)) {
      score += 2;
    } else if (candidate.name.toLowerCase().includes(brandToken)) {
      score += 1.2;
    }
  }

  if (normalizedItem.attributes.organic != null) {
    if (normalizedItem.attributes.organic && candidate.isBio) {
      score += 1;
    }
    if (!normalizedItem.attributes.organic && candidate.isBio === false) {
      score += 0.5;
    }
  }

  if (normalizedItem.quantity?.sizeHint) {
    const sizeToken = normalizedItem.quantity.sizeHint.toLowerCase();
    if (candidate.unitSize && candidate.unitSize.toLowerCase().includes(sizeToken)) {
      score += 0.5;
    }
  }

  return score;
}

function scoreToConfidence(score, tokenCount) {
  if (score <= 0) return 0;
  const divisor = Math.max(2.5, tokenCount * 1.5 + 2);
  return Math.min(0.99, Number((score / divisor).toFixed(2)));
}

export function rankCandidates(normalizedItem, candidates) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      matchScore: Number(computeCandidateScore(normalizedItem, candidate).toFixed(2)),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function decideBestCandidate(normalizedItem, rankedCandidates, options = {}) {
  const { fallbackConfidence = 0.35 } = options;

  if (!Array.isArray(rankedCandidates) || rankedCandidates.length === 0) {
    return {
      decision: 'none',
      confidence: 0,
      reason: 'Geen geschikte producten gevonden',
    };
  }

  const bestCandidate = rankedCandidates[0];
  const confidence = scoreToConfidence(bestCandidate.matchScore, tokenize(normalizedItem.normalizedQuery).length);

  if (confidence < fallbackConfidence) {
    return {
      decision: 'none',
      confidence,
      reason: 'Te lage overeenkomstscore',
    };
  }

  return {
    decision: 'pick',
    chosenProductId: bestCandidate.id,
    confidence,
    reason: 'Beste automatische match op basis van tekstovereenkomst',
  };
}
