package com.wangwenlin.stock.web;

import com.wangwenlin.stock.common.ApiException;
import com.wangwenlin.stock.service.LifePersonaService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 人生规划器「人物画像 / 未来路径库 / 资料检索」子集。
 * 逐行对齐 server.js 9903-10041（画像与路径库）、9531-9641（检索审批工作流）。
 */
@RestController
@RequestMapping("/api/life")
public class LifePersonaController {

    private final LifePersonaService service;

    public LifePersonaController(LifePersonaService service) {
        this.service = service;
    }

    // ==================== 人物画像 ====================

    @GetMapping("/persona")
    public Map<String, Object> persona() {
        try {
            return service.getPersona();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "获取失败");
        }
    }

    @PutMapping("/persona")
    public Map<String, Object> savePersona(@RequestBody(required = false) Map<String, Object> body) {
        try {
            return service.putPersona(body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "保存失败");
        }
    }

    @PostMapping("/persona/derived/refresh")
    public Map<String, Object> refreshDerived(@RequestBody(required = false) Map<String, Object> body) {
        try {
            return service.refreshDerived(body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "重算失败");
        }
    }

    // ==================== 未来路径库 ====================

    @GetMapping("/paths")
    public Map<String, Object> paths() {
        try {
            return service.listPaths();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "获取失败");
        }
    }

    @PostMapping("/paths")
    public Map<String, Object> createPath(@RequestBody(required = false) Map<String, Object> body) {
        try {
            return service.createPath(body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "新增失败");
        }
    }

    @PutMapping("/paths/{id}")
    public Map<String, Object> updatePath(@PathVariable("id") String id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        try {
            return service.updatePath(id, body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "更新失败");
        }
    }

    @DeleteMapping("/paths/{id}")
    public Map<String, Object> deletePath(@PathVariable("id") String id) {
        try {
            return service.deletePath(id);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "删除失败");
        }
    }

    // ==================== 资料检索审批工作流 ====================

    @GetMapping("/retrieval/queue")
    public Map<String, Object> retrievalQueue() {
        try {
            return service.retrievalQueue();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "读取待检索队列失败");
        }
    }

    @PostMapping("/retrieval/collect")
    public Map<String, Object> collect() {
        try {
            return service.collect();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "归集失败");
        }
    }

    @GetMapping("/retrieval/batches")
    public Map<String, Object> retrievalBatches() {
        try {
            return service.retrievalBatches();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "读取批次失败");
        }
    }

    @PostMapping("/retrieval/batches/{id}/decide")
    public Map<String, Object> decide(@PathVariable("id") String id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        try {
            return service.decide(id, body);
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "审批失败");
        }
    }

    @GetMapping("/retrieval/bill")
    public Map<String, Object> retrievalBill() {
        try {
            return service.retrievalBill();
        } catch (ApiException error) {
            throw error;
        } catch (Exception error) {
            throw fail(error, "读取账单失败");
        }
    }

    // ==================== 内部工具 ====================

    /** 等价 Node 的 {@code err.message || '兜底文案'}。 */
    private static ApiException fail(Exception error, String fallback) {
        String message = error.getMessage();
        return new ApiException(500, message == null || message.isEmpty() ? fallback : message);
    }
}
