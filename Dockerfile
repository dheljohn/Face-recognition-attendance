FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    build-essential \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    && rm -rf /var/lib/apt/lists/*

# Install prebuilt dlib wheel directly — skip cmake entirely
RUN pip install --no-cache-dir \
    "https://files.pythonhosted.org/packages/da/06/5fe7c7512a0b5561a578ba8a4b97fc14d94c54425d08c26a99a3a8e3e6e2/dlib-19.24.1-cp311-cp311-manylinux_2_17_x86_64.manylinux2014_x86_64.whl"

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:10000"]