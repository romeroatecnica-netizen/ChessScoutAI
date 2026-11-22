export interface EcoMatch {
  eco: string;
  name: string;
}

interface EcoPattern {
  eco: string;
  name: string;
  moves: string[];
}

// Curated ECO fallback dictionary ordered from deepest lines to broadest lines
const ECO_PATTERNS: EcoPattern[] = [
  {eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']},
  {eco: 'B70', name: 'Sicilian Defense: Dragon Variation', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6']},
  {eco: 'B80', name: 'Sicilian Defense: Scheveningen', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e6']},
  {eco: 'B33', name: 'Sicilian Defense: Sveshnikov', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5']},
  {eco: 'B32', name: 'Sicilian Defense: Accelerated Dragon', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6']},
  {eco: 'B23', name: 'Sicilian Defense: Closed', moves: ['e4', 'c5', 'Nc3']},
  {eco: 'B22', name: 'Sicilian Defense: Alapin', moves: ['e4', 'c5', 'c3']},
  {eco: 'B20', name: 'Sicilian Defense', moves: ['e4', 'c5']},
  {eco: 'C88', name: 'Ruy Lopez: Closed', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7']},
  {eco: 'C65', name: 'Ruy Lopez: Berlin Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6']},
  {eco: 'C60', name: 'Ruy Lopez', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']},
  {eco: 'C55', name: 'Italian Game: Two Knights Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']},
  {eco: 'C53', name: 'Italian Game: Giuoco Piano', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']},
  {eco: 'C50', name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']},
  {eco: 'C45', name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4']},
  {eco: 'C42', name: "Petrov's Defense", moves: ['e4', 'e5', 'Nf3', 'Nf6']},
  {eco: 'C41', name: 'Philidor Defense', moves: ['e4', 'e5', 'Nf3', 'd6']},
  {eco: 'C25', name: 'Vienna Game', moves: ['e4', 'e5', 'Nc3']},
  {eco: 'C30', name: "King's Gambit", moves: ['e4', 'e5', 'f4']},
  {eco: 'C20', name: "King's Pawn Game", moves: ['e4', 'e5']},
  {eco: 'C11', name: 'French Defense: Classical', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6']},
  {eco: 'C02', name: 'French Defense: Advance', moves: ['e4', 'e6', 'd4', 'd5', 'e5']},
  {eco: 'C01', name: 'French Defense: Exchange', moves: ['e4', 'e6', 'd4', 'd5', 'exd5']},
  {eco: 'C00', name: 'French Defense', moves: ['e4', 'e6']},
  {eco: 'B12', name: 'Caro-Kann Defense: Advance', moves: ['e4', 'c6', 'd4', 'd5', 'e5']},
  {eco: 'B13', name: 'Caro-Kann Defense: Exchange', moves: ['e4', 'c6', 'd4', 'd5', 'exd5']},
  {eco: 'B10', name: 'Caro-Kann Defense', moves: ['e4', 'c6']},
  {eco: 'B01', name: 'Scandinavian Defense', moves: ['e4', 'd5']},
  {eco: 'B07', name: 'Pirc Defense', moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3']},
  {eco: 'B06', name: 'Modern Defense', moves: ['e4', 'g6']},
  {eco: 'B02', name: "Alekhine's Defense", moves: ['e4', 'Nf6']},
  {eco: 'D35', name: "Queen's Gambit Declined: Exchange", moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5']},
  {eco: 'D30', name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6']},
  {eco: 'D10', name: 'Slav Defense', moves: ['d4', 'd5', 'c4', 'c6']},
  {eco: 'D20', name: "Queen's Gambit Accepted", moves: ['d4', 'd5', 'c4', 'dxc4']},
  {eco: 'D02', name: 'London System', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4']},
  {eco: 'D00', name: "Queen's Pawn Game / London", moves: ['d4', 'd5', 'Bf4']},
  {eco: 'D06', name: "Queen's Gambit", moves: ['d4', 'd5', 'c4']},
  {eco: 'E60', name: "King's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'g6']},
  {eco: 'E20', name: 'Nimzo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4']},
  {eco: 'E15', name: "Queen's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6']},
  {eco: 'E00', name: 'Catalan Opening', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3']},
  {eco: 'D80', name: 'Grünfeld Defense', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5']},
  {eco: 'A57', name: 'Benko Gambit', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5']},
  {eco: 'A60', name: 'Benoni Defense', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5']},
  {eco: 'A45', name: 'Trompowsky Attack', moves: ['d4', 'Nf6', 'Bg5']},
  {eco: 'A80', name: 'Dutch Defense', moves: ['d4', 'f5']},
  {eco: 'A40', name: "Queen's Pawn Opening", moves: ['d4']},
  {eco: 'A20', name: 'English Opening: Reversed Sicilian', moves: ['c4', 'e5']},
  {eco: 'A10', name: 'English Opening', moves: ['c4']},
  {eco: 'A06', name: 'Réti Opening', moves: ['Nf3', 'd5']},
  {eco: 'A04', name: 'Zukertort Opening', moves: ['Nf3']},
  {eco: 'A00', name: 'Irregular / Uncommon Opening', moves: ['g3']},
];

export function parseEcoUrlName(ecoUrl?: string): string | null {
  if (!ecoUrl) return null;
  try {
    const parts = ecoUrl.split('/openings/');
    if (parts.length < 2) return null;
    let slug = parts[1].split('?')[0];
    // Trim trailing move notation like -3.Nc3-d5 or -4...Nf6
    slug = slug.replace(/-\d+\.{1,3}[A-Za-z0-9+#=]+.*$/, '');
    const words = slug
      .split('-')
      .filter(Boolean)
      .map((w) => {
        if (w.length <= 2 && /^[A-Z0-9]+$/i.test(w)) return w;
        return w.charAt(0).toUpperCase() + w.slice(1);
      });
    const full = words.join(' ').trim();
    if (!full) return null;
    // Simplify overly verbose multi-clause names while keeping main family + variation
    if (full.length > 52) {
      return full.slice(0, 49).trimEnd() + '…';
    }
    return full;
  } catch {
    return null;
  }
}

export function identifyOpening(
  pgnEco?: string,
  ecoUrl?: string,
  sanMoves: string[] = []
): EcoMatch {
  const urlName = parseEcoUrlName(ecoUrl);

  let matchedPattern: EcoPattern | null = null;
  for (const pattern of ECO_PATTERNS) {
    if (sanMoves.length >= pattern.moves.length) {
      let ok = true;
      for (let i = 0; i < pattern.moves.length; i++) {
        if (sanMoves[i] !== pattern.moves[i]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        matchedPattern = pattern;
        break;
      }
    }
  }

  return {
    eco: pgnEco || matchedPattern?.eco || 'A00',
    name: urlName || matchedPattern?.name || 'Unclassified Opening',
  };
}

export function normalizeFenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}
