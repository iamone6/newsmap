<?php

namespace App\Domain\Article\Services;

use App\Domain\Article\Consts\ArticleConsts;
use App\Domain\Article\Exceptions\QueryEmbeddingFailedException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * 검색어를 DeepInfra(OpenAI 호환 API)의 Qwen3-Embedding 으로 임베딩한다.
 * rag 와 같은 모델·차원을 쓰고, 질의용 instruction 을 앞에 붙인다.
 * 같은 검색어는 캐시해서 다시 호출하지 않는다.
 */
class QueryEmbeddingService
{
    /**
     * 검색어 임베딩 벡터를 돌려준다.
     *
     * @param  string  $queryText  사용자 검색어
     * @return list<float> 임베딩 벡터 (config newsmap.embedding.dimensions 차원)
     *
     * @throws QueryEmbeddingFailedException 키가 없거나, 호출 실패, 응답 차원이 다를 때
     */
    public function embed(string $queryText): array
    {
        $config = config('newsmap.embedding');
        $cacheKey = 'query-embedding:'.hash('sha256', $config['model'].'|'.$queryText);

        return Cache::remember(
            $cacheKey,
            $config['cache_seconds'],
            fn (): array => $this->requestEmbedding($queryText, $config),
        );
    }

    /**
     * pgvector halfvec 리터럴로 바꾼다. 예) "[0.1,0.2,...]"
     *
     * @param  list<float>  $vector  임베딩 벡터
     * @return string SQL 파라미터로 넘길 문자열
     */
    public function toVectorLiteral(array $vector): string
    {
        return '['.implode(',', $vector).']';
    }

    /**
     * DeepInfra embeddings API 를 호출한다.
     *
     * @param  string  $queryText  사용자 검색어
     * @param  array{base_url: string, api_key: string|null, model: string, dimensions: int, timeout_seconds: int}  $config  임베딩 설정
     * @return list<float> 임베딩 벡터
     *
     * @throws QueryEmbeddingFailedException 실패할 때
     */
    private function requestEmbedding(string $queryText, array $config): array
    {
        if (empty($config['api_key'])) {
            throw new QueryEmbeddingFailedException('DEEPINFRA_API_KEY 가 설정되지 않았습니다.');
        }

        try {
            $response = Http::baseUrl($config['base_url'])
                ->withToken($config['api_key'])
                ->acceptJson()
                ->timeout($config['timeout_seconds'])
                ->post('embeddings', [
                    'model' => $config['model'],
                    'input' => ArticleConsts::QUERY_INSTRUCTION.$queryText,
                    'encoding_format' => 'float',
                ])
                ->throw();
        } catch (ConnectionException|RequestException $exception) {
            throw new QueryEmbeddingFailedException('쿼리 임베딩 호출 실패: '.$exception->getMessage(), previous: $exception);
        }

        $vector = $response->json('data.0.embedding');
        if (! is_array($vector) || count($vector) !== $config['dimensions']) {
            throw new QueryEmbeddingFailedException("쿼리 임베딩 차원이 {$config['dimensions']} 가 아닙니다.");
        }

        return array_map(floatval(...), $vector);
    }
}
