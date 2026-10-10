.PHONY: test dev-backend dev-frontend install clean

PYTHON ?= .venv/bin/python
PYTEST ?= .venv/bin/pytest
UVICORN ?= .venv/bin/uvicorn

install:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -e backend/ || .venv/bin/pip install -r backend/requirements.txt
	cd frontend && npm install

test:
	PYTHONPATH=backend $(PYTEST) backend/tests -v

dev-backend:
	PYTHONPATH=backend $(UVICORN) sutra.main:app --host 127.0.0.1 --port 8000 --reload

dev-frontend:
	cd frontend && npm run dev

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
