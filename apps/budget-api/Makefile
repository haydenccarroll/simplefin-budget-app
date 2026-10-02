.PHONY: sqlc-generate docs

sqlc-generate:
	sqlc generate

docs:
	@swag init -g main.go -o docs --outputTypes yaml > /dev/null 2>&1 || swag init -g main.go -o docs --outputTypes yaml
	@rm -f docs/docs.go docs/swagger.json
