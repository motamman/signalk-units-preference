#!/bin/bash

# Test js-quantities API endpoints
# Run this after starting SignalK server with the plugin enabled

BASE_URL="http://localhost:3000/plugins/signalk-units-preference"

echo "═══════════════════════════════════════════════════════════════════"
echo "   Testing js-quantities API Endpoints"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

echo "1. Get available target units for m/s (speed):"
echo "   GET $BASE_URL/quantities/available-targets/m%2Fs"
curl -s "$BASE_URL/quantities/available-targets/m%2Fs" | jq '.'
echo ""

echo "2. Generate formula for m/s → knots:"
echo "   POST $BASE_URL/quantities/generate-formula"
curl -s -X POST "$BASE_URL/quantities/generate-formula" \
  -H "Content-Type: application/json" \
  -d '{"baseUnit":"m/s","targetUnit":"knots"}' | jq '.'
echo ""

echo "3. Generate formula for K → celsius (temperature with offset):"
echo "   POST $BASE_URL/quantities/generate-formula"
curl -s -X POST "$BASE_URL/quantities/generate-formula" \
  -H "Content-Type: application/json" \
  -d '{"baseUnit":"K","targetUnit":"celsius"}' | jq '.'
echo ""

echo "4. Get all supported quantity kinds:"
echo "   GET $BASE_URL/quantities/kinds"
curl -s "$BASE_URL/quantities/kinds" | jq '.kinds | length' | head -1 | xargs echo "   Found kinds:"
echo ""

echo "5. Test unsupported conversion (should fail gracefully):"
echo "   POST $BASE_URL/quantities/generate-formula"
curl -s -X POST "$BASE_URL/quantities/generate-formula" \
  -H "Content-Type: application/json" \
  -d '{"baseUnit":"tr","targetUnit":"custom"}' | jq '.'
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "   Test Complete"
echo "═══════════════════════════════════════════════════════════════════"
