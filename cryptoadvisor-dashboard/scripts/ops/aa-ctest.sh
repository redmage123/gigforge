cd /app
export TEST_DATABASE_URL="${DATABASE_URL%/assetadvisor}/assetadvisor_test"
[ "$TEST_DATABASE_URL" != "$DATABASE_URL" ] || { echo "refusing: test URL equals app URL"; exit 1; }
python -m pytest tests -q -p no:cacheprovider --ignore=tests/test_trading.py --ignore=tests/test_multitenancy.py 2>&1 | tail -1
