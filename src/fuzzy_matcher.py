"""
Fuzzy Matching Algorithm for Dekereke Sound File Association Tool
Matches orphaned files to missing expected files using similarity metrics
"""

from typing import List, Dict, Any
import Levenshtein


class FuzzyMatcher:
    """Fuzzy matching algorithm for file associations"""
    
    def __init__(self):
        self.confidence_threshold = 0.5
    
    def find_matches(
        self,
        missing: List[Dict[str, Any]],
        orphaned: List[str],
        records: List[Dict[str, str]]
    ) -> List[Dict[str, Any]]:
        """
        Find potential matches between orphaned files and missing expected files
        
        Args:
            missing: List of expected files not found
            orphaned: List of actual files without matches
            records: All XML records for context
        
        Returns:
            List of suggested matches with confidence scores
        """
        suggestions = []
        
        for orphan in orphaned:
            best_matches = []
            
            for miss in missing:
                confidence = self._calculate_confidence(orphan, miss, records)
                
                if confidence >= self.confidence_threshold:
                    best_matches.append({
                        'orphan': orphan,
                        'expected': miss,
                        'confidence': confidence,
                        'auto_accept': confidence >= 0.85
                    })
            
            # Sort by confidence (descending)
            best_matches.sort(key=lambda x: x['confidence'], reverse=True)
            
            # Add top matches to suggestions
            if best_matches:
                suggestions.extend(best_matches[:3])  # Top 3 matches per orphan
        
        return suggestions
    
    def _calculate_confidence(
        self,
        orphan: str,
        expected: Dict[str, Any],
        records: List[Dict[str, str]]
    ) -> float:
        """
        Calculate confidence score for a potential match
        
        Factors:
        - Filename similarity (Levenshtein distance)
        - Reference number proximity
        - Gloss matching
        """
        expected_filename = expected['filename']
        
        # Filename similarity (0-1, higher is better)
        filename_similarity = 1.0 - (
            Levenshtein.distance(orphan.lower(), expected_filename.lower()) /
            max(len(orphan), len(expected_filename))
        )
        
        # Reference number similarity
        ref_similarity = self._reference_similarity(orphan, expected['reference'])
        
        # Gloss matching
        gloss_similarity = self._gloss_similarity(orphan, expected.get('gloss', ''))
        
        # Weighted average
        confidence = (
            filename_similarity * 0.5 +
            ref_similarity * 0.3 +
            gloss_similarity * 0.2
        )
        
        return confidence
    
    def _reference_similarity(self, filename: str, reference: str) -> float:
        """Calculate similarity based on reference number"""
        if not reference:
            return 0.0
        
        # Check if reference appears in filename
        if reference in filename:
            return 1.0
        
        # Check for partial match (accounting for leading zeros)
        ref_stripped = reference.lstrip('0')
        if ref_stripped and ref_stripped in filename:
            return 0.8
        
        return 0.0
    
    def _gloss_similarity(self, filename: str, gloss: str) -> float:
        """Calculate similarity based on gloss"""
        if not gloss:
            return 0.0
        
        # Convert to lowercase for comparison
        filename_lower = filename.lower()
        gloss_lower = gloss.lower()
        
        # Check for exact match
        if gloss_lower in filename_lower:
            return 1.0
        
        # Check for partial match (first 4 characters)
        if len(gloss_lower) >= 4:
            gloss_prefix = gloss_lower[:4]
            if gloss_prefix in filename_lower:
                return 0.6
        
        return 0.0
